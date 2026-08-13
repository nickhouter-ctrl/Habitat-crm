/**
 * Ruimt negen dubbel geboekte inkoopfacturen op — 13-08-2026.
 *
 *  · A0030 (Ahmed Bouzekri) — stond al geboekt op 10-08; bij het keuren van de
 *    achterstand is hij vandaag nóg eens goedgekeurd, ondanks de
 *    duplicaat-markering. De oorspronkelijke blijft.
 *  · Hollandse Meesters 260014 t/m 260020 en 260045 — elke factuur staat twee
 *    keer: een eerste inboeking zonder Holded-koppeling en een tweede mét. De
 *    versie die in Holded staat blijft, anders raakt de boekhouding los van het
 *    CRM.
 *
 * Let op de asymmetrie: de blijvers van Hollandse Meesters hebben wél een
 * project en de btw-uitsplitsing, maar míssen de bijlage, de gekoppelde mail en
 * de keurregel — die zitten juist op de te verwijderen versie. Alles wat alleen
 * op de dubbele staat wordt daarom eerst overgezet. Zonder die stap verlies je
 * het bronbestand en houd je een mail die "gelinkt" zegt zonder vindbare
 * inkooporder.
 *
 * Draait in één transactie; stopt zodra een blijver niet bestaat of een te
 * verwijderen regel tóch in Holded blijkt te staan.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/opruimen-dubbele-inkoop-13-08.ts --dry
 */
import "./load-env";

import { pgClient } from "../lib/db";

type Paar = { weg: string; houd: string; wat: string };

const PAREN: Paar[] = [
  { weg: "c71b8a72-94de-4e96-8967-70299c928bc4", houd: "ed773b17-f7b6-4b2a-b0cc-cefde0724256", wat: "Ahmed A0030 — vandaag dubbel goedgekeurd; de boeking van 10-08 blijft" },
  { weg: "772cb06a-3795-45e6-88bf-52917121de4f", houd: "47c84e33-dcac-451a-8199-690988b1b1f8", wat: "Hollandse Meesters 260014" },
  { weg: "5a37be63-1cf8-4110-91ce-eee642d33bec", houd: "6dd9c301-8110-4efa-b941-0e0ecc358297", wat: "Hollandse Meesters 260015" },
  { weg: "caf30a1c-518f-4cbb-801d-a5b333029fb2", houd: "41d4880a-b4ac-480c-8848-e1842d7a9d2b", wat: "Hollandse Meesters 260016" },
  { weg: "dc626410-9c94-47b0-a93c-6d9b71d64837", houd: "4b57158c-1e52-4e23-968f-85e096af8c36", wat: "Hollandse Meesters 260017" },
  { weg: "bc4730eb-527d-49c8-8455-19fda3f3fa54", houd: "4370eebb-fcba-4556-bfbb-65e4d8d3ec52", wat: "Hollandse Meesters 260018" },
  { weg: "2fa3b9d3-65f3-44e3-9b5f-24479ee02f50", houd: "3ade3e88-da35-4d75-95c1-7016e9e7dbab", wat: "Hollandse Meesters 260019" },
  { weg: "ad51ec37-82a4-499c-9d38-255e0f69854c", houd: "b54cf9f3-e2c0-407d-8b2f-ed91eeb13350", wat: "Hollandse Meesters 260020" },
  { weg: "db5bd57f-9bd3-401a-a1e4-c13c21c061da", houd: "67bfcea8-925a-4926-a5bc-e7f77dc349f0", wat: "Hollandse Meesters 260045" },
];

type Po = { id: string; supplier: string; reference: string | null; total: string; holded_id: string | null; attachments: unknown };

async function main() {
  const dry = process.argv.includes("--dry");
  let opgeruimd = 0;

  await pgClient
    .begin(async (tx) => {
      for (const p of PAREN) {
        const [weg] = (await tx`select id, supplier, reference, total, holded_id, attachments from purchase_orders where id = ${p.weg}`) as unknown as Po[];
        const [houd] = (await tx`select id, supplier, reference, total, holded_id, attachments from purchase_orders where id = ${p.houd}`) as unknown as Po[];
        if (!weg) {
          console.log(`(al opgeruimd) ${p.wat}`);
          continue;
        }
        if (!houd) throw new Error(`Blijver ontbreekt voor ${p.wat} — gestopt, niets verwijderd.`);
        if (weg.holded_id) throw new Error(`${p.wat}: de te verwijderen regel staat in Holded (${weg.holded_id}) — gestopt.`);

        console.log(`${p.wat}`);
        console.log(`   WEG:  "${weg.reference}" € ${weg.total}`);
        console.log(`   HOUD: "${houd.reference}" € ${houd.total}${houd.holded_id ? " (in Holded)" : ""}`);

        const mails = await tx`update email_inbox set linked_purchase_order_id = ${p.houd}, updated_at = now()
          where linked_purchase_order_id = ${p.weg} returning id`;
        if (mails.length) console.log(`   ${mails.length} mail(s) omgehangen`);

        const keur = await tx`update purchase_invoice_reviews set purchase_order_id = ${p.houd}, updated_at = now()
          where purchase_order_id = ${p.weg} returning id`;
        if (keur.length) console.log(`   ${keur.length} keurregel(s) omgehangen`);
        await tx`update purchase_invoice_reviews set duplicate_of_po_id = ${p.houd} where duplicate_of_po_id = ${p.weg}`;

        // Bijlagen alleen overzetten als de blijver er geen heeft — anders
        // raak je het bronbestand kwijt bij het verwijderen.
        const wegB = Array.isArray(weg.attachments) ? weg.attachments : [];
        const houdB = Array.isArray(houd.attachments) ? houd.attachments : [];
        if (houdB.length === 0 && wegB.length > 0) {
          await tx`update purchase_orders set attachments = ${JSON.stringify(wegB)}::jsonb, updated_at = now() where id = ${p.houd}`;
          console.log(`   ${wegB.length} bijlage(n) overgezet`);
        }

        // Project, arbeid-duiding en btw alleen aanvullen waar de blijver leeg is.
        await tx`
          update purchase_orders h set
            project_id = coalesce(h.project_id, w.project_id),
            suggested_project_id = coalesce(h.suggested_project_id, w.suggested_project_id),
            count_as_labor = h.count_as_labor or w.count_as_labor,
            subtotal = coalesce(h.subtotal, w.subtotal),
            tax = coalesce(h.tax, w.tax),
            updated_at = now()
          from purchase_orders w
          where h.id = ${p.houd} and w.id = ${p.weg}`;

        await tx`insert into activities (type, subject, body) values (
          ${"note"},
          ${`Dubbele inkoopfactuur opgeruimd: ${weg.supplier} ${weg.reference ?? ""}`.trim()},
          ${`Verwijderd als duplicaat van "${houd.reference}" (€ ${weg.total}).\n${p.wat}`}
        )`;

        await tx`delete from purchase_orders where id = ${p.weg}`;
        console.log(`   verwijderd\n`);
        opgeruimd++;
      }
      if (dry) throw new Error("__DRY__");
    })
    .catch((e) => {
      if (e instanceof Error && e.message === "__DRY__") {
        console.log("[DRY RUN] transactie teruggedraaid — er is niets gewijzigd.");
        return;
      }
      throw e;
    });

  const [n] = (await pgClient`select count(*)::int as n from purchase_orders`) as unknown as Array<{ n: number }>;
  console.log(`${opgeruimd} opgeruimd. Inkooporders nu: ${n.n}`);
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
