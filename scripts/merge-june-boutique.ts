/**
 * Eenmalige merge: het website-lead-contact "Maxime" (offerteaanvraag) en het
 * klant-contact "The June Boutiques sl" (uit de goedgekeurde accountaanvraag)
 * zijn dezelfde klant. We hangen alle verwijzingen om naar het klant-contact,
 * maken dat contact netjes zakelijk (bedrijf + BTW gekoppeld) en verwijderen de
 * lead. Idempotent-ish: draait binnen één transactie.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

const LEAD = "22ab04dd-5606-457f-9d88-d6537e4559c1"; // Maxime — lead, website-aanvraag
const CUST = "8e386b90-cfd1-42fb-a28c-75340b9ab49d"; // The June Boutiques sl — customer

const DRY = process.argv.includes("--dry");

(async () => {
  await db.transaction(async (tx) => {
    // Sanity: beide contacten bestaan nog?
    const both = await tx.execute(sql`SELECT id, name, company_id, phone FROM contacts WHERE id IN (${LEAD}, ${CUST})`);
    const rows = (both as any).rows ?? both;
    if (rows.length !== 2) throw new Error(`Verwacht 2 contacten, kreeg ${rows.length} — al gemerged?`);

    // Accountaanvraag met bedrijfsdata (voor bedrijf + BTW).
    const arr = await tx.execute(sql`SELECT business_name, vat_number, address, locale FROM account_requests WHERE contact_id=${CUST} LIMIT 1`);
    const ar = ((arr as any).rows ?? arr)[0] as { business_name: string; vat_number: string; address: string; locale: string } | undefined;

    // 1) Verwijzingen omhangen LEAD -> CUST
    for (const t of ["activities", "documents", "quote_requests"]) {
      const r = await tx.execute(sql.raw(`UPDATE ${t} SET contact_id='${CUST}' WHERE contact_id='${LEAD}'`));
      console.log(`  ${t}: ${(r as any).count ?? "?"} omgehangen`);
    }

    // 2) Klant-contact netjes zakelijk maken als er nog geen bedrijf hangt
    const cust = rows.find((r: any) => r.id === CUST);
    if (!cust.company_id && ar?.business_name) {
      const co = await tx.execute(sql`
        INSERT INTO companies (name, type, vat_number, email, phone, address_line, country)
        VALUES (${ar.business_name}, 'client', ${ar.vat_number || null}, 'always@thejunebenissa.com', ${cust.phone || null}, ${ar.address || null}, 'ES')
        RETURNING id`);
      const companyId = ((co as any).rows ?? co)[0].id;
      await tx.execute(sql`UPDATE contacts SET company_id=${companyId}, name=${ar.business_name}, first_name='Maxime', updated_at=now() WHERE id=${CUST}`);
      console.log(`  bedrijf aangemaakt & gekoppeld: ${companyId} (${ar.business_name})`);
    } else {
      console.log("  contact heeft al een bedrijf of geen bedrijfsdata — overgeslagen");
    }

    // 3) Lead verwijderen
    await tx.execute(sql`DELETE FROM contacts WHERE id=${LEAD}`);
    console.log(`  lead-contact ${LEAD} verwijderd`);

    if (DRY) {
      console.log("\nDRY RUN — transactie wordt teruggedraaid.");
      throw new Error("__DRY_ROLLBACK__");
    }
  }).catch((e) => {
    if (e instanceof Error && e.message === "__DRY_ROLLBACK__") return;
    throw e;
  });
  console.log("\nKlaar.");
})().then(() => process.exit(0)).catch((e) => { console.error("FOUT:", e.message); process.exit(1); });
