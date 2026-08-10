/**
 * Ruimt vijf dubbel ingeboekte inkoopfacturen op — 10-08-2026.
 *
 * Elk paar is aangetoond dubbel doordat BEIDE regels naar hetzelfde
 * bronbestand verwijzen (zelfde bijlagenaam, bij A0029 zelfs byte-identiek),
 * met hetzelfde factuurnummer en bedrag. Oorzaak: de dubbeltjes-controle keek
 * naar de referentie, en die begint met de leveranciersnaam uit de
 * AI-uitlezing — die verschilde per keer. Die controle is inmiddels gefixt.
 *
 * Verwijderen alleen is niet genoeg: er hangen mails en goedkeuringsregels aan
 * de te schrappen inkooporders. Die worden eerst omgehangen naar de blijver,
 * anders houd je een mail die "gelinkt" zegt zonder vindbare inkooporder.
 * Ook `kind` en ontbrekende bijlagen gaan mee, zodat er geen informatie
 * verdwijnt die alleen op de dubbele stond.
 *
 * Geen van de te verwijderen regels staat in Holded — de boekhouding blijft
 * dus ongemoeid. Draait in één transactie.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/opruimen-dubbele-inkoop-2026-08.ts --dry
 */
import "./load-env";

import { pgClient } from "../lib/db";

type Paar = { weg: string; houd: string; waarom: string };

const PAREN: Paar[] = [
  {
    weg: "116824a0-b3ad-4331-b3ee-6c5e9b9859f5", // DEMARSAN PINTURAS SLU FC203801-3286
    houd: "8a0e7342-e42a-47f1-bd7e-cc8a69997f7a", // Montó Tiendas FC203801-3286
    waarom: "beide uit Montó FC203801-3286.pdf; leverancier DEMARSAN was een misser van de AI-uitlezing",
  },
  {
    weg: "c72558c8-5971-4213-baf2-8ccc6b393007", // DEMARSAN PINTURAS SLU FC203801-3418
    houd: "c3deeac9-d7db-49b9-99b9-69176f5bca17", // Montó FC203801-3418
    waarom: "beide uit Montó FC203801-3418 08-07-2026.pdf; idem",
  },
  {
    weg: "367db8fe-b62f-4132-be5b-b7f809f584ff", // Ahmed Bouzekri A0023
    houd: "594e5290-ff14-45fc-a5ba-8bb00164b9ff", // Ahmed Bouzekri (Construcciones Ahmed Javea) A0023
    waarom: "beide uit A0023 Ahmed Silvestre.pdf; blijver heeft de volledige bedrijfsnaam",
  },
  {
    weg: "12acabe0-47e5-4db5-898d-4eefbecc4ca8", // Ahmed Javea A0029
    houd: "d36c2e03-2e9d-41ed-bf15-5208963a1253", // Ahmed Javea Construcciones A0029
    waarom: "beide uit A0029 Ahmed cap negre.pdf (160.143 bytes in allebei de mails; de tweede mail is een Fwd van de eerste)",
  },
  {
    weg: "7c10a0a5-34a5-4b00-8975-393151b5bdf8", // teresa borras 23TA-26050245 (3) (1)
    houd: "006e04bc-2189-456b-a968-ff0bfd04d3f7", // ALIANZA LOGISTICS 23T/A-26050245
    waarom: "zelfde factuur 23T/A-26050245; Teresa Borras is de contactpersoon bij Alianza. Blijver staat al in Holded",
  },
];

type Po = {
  id: string;
  supplier: string;
  reference: string | null;
  total: string;
  kind: string;
  holded_id: string | null;
  attachments: unknown;
};

async function main() {
  const dry = process.argv.includes("--dry");

  await pgClient.begin(async (tx) => {
    for (const paar of PAREN) {
      const [weg] = (await tx`select id, supplier, reference, total, kind, holded_id, attachments from purchase_orders where id = ${paar.weg}`) as unknown as Po[];
      const [houd] = (await tx`select id, supplier, reference, total, kind, holded_id, attachments from purchase_orders where id = ${paar.houd}`) as unknown as Po[];
      if (!weg) {
        console.log(`(al opgeruimd) ${paar.waarom}\n`);
        continue;
      }
      if (!houd) throw new Error(`Blijver ${paar.houd} bestaat niet — gestopt, er is niets verwijderd.`);
      if (weg.holded_id) throw new Error(`${weg.supplier} ${weg.reference} staat in Holded (${weg.holded_id}) — niet verwijderen.`);

      console.log(`WEG:  ${weg.supplier} · ${weg.reference} · € ${weg.total}`);
      console.log(`HOUD: ${houd.supplier} · ${houd.reference} · € ${houd.total}${houd.holded_id ? " (in Holded)" : ""}`);
      console.log(`      ${paar.waarom}`);

      // 1. Mails omhangen — anders "gelinkt" zonder vindbare inkooporder.
      const mails = await tx`update email_inbox set linked_purchase_order_id = ${paar.houd}, updated_at = now()
        where linked_purchase_order_id = ${paar.weg} returning id`;
      if (mails.length) console.log(`      ${mails.length} mail(s) omgehangen naar de blijver`);

      // 2. Goedkeuringsregels van de inkoopfacturen idem.
      const reviews = await tx`update purchase_invoice_reviews set purchase_order_id = ${paar.houd}, updated_at = now()
        where purchase_order_id = ${paar.weg} returning id`;
      if (reviews.length) console.log(`      ${reviews.length} goedkeuringsregel(s) omgehangen`);
      await tx`update purchase_invoice_reviews set duplicate_of_po_id = ${paar.houd} where duplicate_of_po_id = ${paar.weg}`;

      // 3. Informatie die alleen op de dubbele stond meenemen: het documentsoort
      //    "invoice" (nauwkeuriger dan "order") en de bewaarde bijlagen.
      if (weg.kind === "invoice" && houd.kind !== "invoice") {
        await tx`update purchase_orders set kind = ${"invoice"}, updated_at = now() where id = ${paar.houd}`;
        console.log(`      soort overgenomen: order → invoice`);
      }
      const wegBijlagen = Array.isArray(weg.attachments) ? weg.attachments : [];
      const houdBijlagen = Array.isArray(houd.attachments) ? houd.attachments : [];
      if (houdBijlagen.length === 0 && wegBijlagen.length > 0) {
        await tx`update purchase_orders set attachments = ${JSON.stringify(wegBijlagen)}::jsonb, updated_at = now() where id = ${paar.houd}`;
        console.log(`      ${wegBijlagen.length} bijlage(n) overgenomen`);
      }

      // Projectkoppeling en arbeid/materiaal-duiding: alleen aanvullen waar de
      // blijver niets heeft. Bij A0029 hangt "Finca Lisa · uren" aan de blijver,
      // maar andersom mag het net zo goed voorkomen.
      const overnemen = await tx`
        update purchase_orders h set
          project_id = coalesce(h.project_id, w.project_id),
          suggested_project_id = coalesce(h.suggested_project_id, w.suggested_project_id),
          count_as_labor = h.count_as_labor or w.count_as_labor,
          subtotal = coalesce(h.subtotal, w.subtotal),
          tax = coalesce(h.tax, w.tax),
          updated_at = now()
        from purchase_orders w
        where h.id = ${paar.houd} and w.id = ${paar.weg}
          and (h.project_id is distinct from coalesce(h.project_id, w.project_id)
            or h.subtotal is distinct from coalesce(h.subtotal, w.subtotal)
            or (w.count_as_labor and not h.count_as_labor))
        returning h.id`;
      if (overnemen.length) console.log(`      project/btw-gegevens aangevuld vanaf de dubbele`);

      // 4. Spoor nalaten op de blijver, zodat later navolgbaar is wat hier gebeurde.
      await tx`insert into activities (type, subject, body) values (
        ${"note"},
        ${`Dubbele inkoopfactuur samengevoegd: ${weg.supplier} ${weg.reference ?? ""}`.trim()},
        ${`Verwijderd als duplicaat van ${houd.supplier} ${houd.reference ?? ""} (€ ${weg.total}).\n${paar.waarom}`}
      )`;

      await tx`delete from purchase_orders where id = ${paar.weg}`;
      console.log(`      verwijderd\n`);
    }

    if (dry) throw new Error("__DRY__");
  }).catch((e) => {
    if (e instanceof Error && e.message === "__DRY__") {
      console.log("[DRY RUN] transactie teruggedraaid — er is niets gewijzigd.");
      return;
    }
    throw e;
  });

  const [n] = (await pgClient`select count(*)::int as n from purchase_orders`) as unknown as Array<{ n: number }>;
  console.log(`Inkooporders nu: ${n.n}`);
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
