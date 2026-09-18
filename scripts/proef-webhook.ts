/**
 * Proef op de Resend-webhook: nagemaakte berichten, met en zonder geldige
 * signatuur, tegen de lokale dev-server.
 *
 *     npm run dev            (in een ander venster)
 *     npx tsx scripts/proef-webhook.ts
 *
 * Verwacht: 401 bij een kapotte signatuur en bij een herhaald oud bericht,
 * 200 met de juiste classificatie bij bezorgd, harde bounce, zachte bounce en
 * klacht. Ruim daarna de proefadressen op met een SQL-delete op
 * email_suppressions where email like '%nergens.test'.
 */
import { createHmac } from "node:crypto";

const URL_ = "http://localhost:3000/api/webhooks/resend";
const SECRET = process.env.RESEND_WEBHOOK_SECRET!;

function stuur(body: unknown, opts?: { kapotteSignatuur?: boolean; oud?: boolean }) {
  const ruw = JSON.stringify(body);
  const id = "msg_" + Math.random().toString(36).slice(2);
  const ts = String(Math.floor(Date.now() / 1000) - (opts?.oud ? 3600 : 0));
  const sig =
    "v1," +
    createHmac("sha256", Buffer.from(SECRET.replace(/^whsec_/, ""), "base64"))
      .update(`${id}.${ts}.${ruw}`)
      .digest("base64");
  return fetch(URL_, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": ts,
      "svix-signature": opts?.kapotteSignatuur ? "v1,onzin" : sig,
    },
    body: ruw,
  });
}

async function main() {
  const proef = (naam: string, r: Response, tekst: string) =>
    console.log(`${naam.padEnd(38)} ${r.status}  ${tekst.slice(0, 120)}`);

  let r = await stuur({ type: "email.delivered", data: { email_id: "x", to: ["a@b.es"] } }, { kapotteSignatuur: true });
  proef("kapotte signatuur", r, await r.text());

  r = await stuur({ type: "email.bounced", data: { email_id: "x", to: ["a@b.es"] } }, { oud: true });
  proef("oud bericht (herhaling)", r, await r.text());

  r = await stuur({ type: "email.delivered", data: { email_id: "onbekend", to: ["niemand@nergens.test"] } });
  proef("bezorgd, onbekende mail", r, await r.text());

  r = await stuur({
    type: "email.bounced",
    data: { email_id: "onbekend", to: ["proefbounce@nergens.test"], bounce: { type: "Permanent", subType: "General" } },
  });
  proef("harde bounce", r, await r.text());

  r = await stuur({
    type: "email.bounced",
    data: { email_id: "onbekend", to: ["proefsoft@nergens.test"], bounce: { type: "Transient", subType: "MailboxFull" } },
  });
  proef("zachte bounce", r, await r.text());

  r = await stuur({ type: "email.complained", data: { email_id: "onbekend", to: ["proefklacht@nergens.test"] } });
  proef("spamklacht", r, await r.text());
  process.exit(0);
}
main();
