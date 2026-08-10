/**
 * Eenmalig herstel (10-08-2026): Silvestre-facturen aan het juiste
 * Holded-document hangen.
 *
 * FAC-2026-0031 was gekoppeld aan de Holded-id van FAC-2026-0014 (verrekend
 * via creditnota CN260015, dus "betaald") waardoor de nachtelijke betaalsync
 * hem elke nacht onterecht op betaald zette. F260012/F260013 wijzen naar
 * Holded-ids die niet meer bestaan, dus een echte betaling zou nooit
 * doorkomen. Dit script koppelt alle drie opnieuw op factuurnummer.
 *
 * Draaien: npx tsx --env-file=.env.local scripts/herstel-silvestre-koppeling.ts
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const holdedHeaders = { key: process.env.HOLDED_API_KEY!, accept: "application/json" };

const LOKAAL_0031 = "6270458e-346c-4a9b-a9fc-e9d9c955f390";

async function holdedFacturen(): Promise<Map<string, { id: string; total: number; status: number; paymentsTotal: number }>> {
  const r = await fetch("https://api.holded.com/api/invoicing/v1/documents/invoice?paginate=false", { headers: holdedHeaders });
  if (!r.ok) throw new Error(`Holded-lijst mislukt: ${r.status}`);
  const lijst = (await r.json()) as Array<Record<string, unknown>>;
  const opNummer = new Map();
  for (const d of lijst) {
    const num = String(d.docNumber ?? "").trim();
    if (num) opNummer.set(num, { id: d.id ?? d._id, total: Number(d.total), status: Number(d.status), paymentsTotal: Number(d.paymentsTotal ?? 0) });
  }
  return opNummer;
}

async function main() {
  const opNummer = await holdedFacturen();

  const doelen: { lokaalId?: string; nummer?: string; resetPaid?: boolean }[] = [
    { lokaalId: LOKAAL_0031, resetPaid: true },
    { nummer: "F260012" },
    { nummer: "F260013" },
  ];

  for (const doel of doelen) {
    const [lokaal] = doel.lokaalId
      ? await sql`select id, doc_number, total_eur, holded_id from documents where id = ${doel.lokaalId}`
      : await sql`select id, doc_number, total_eur, holded_id from documents where doc_number = ${doel.nummer!} and kind = 'invoice'`;
    if (!lokaal) { console.log(`— ${doel.nummer ?? doel.lokaalId}: lokaal niet gevonden, overslaan`); continue; }

    const h = opNummer.get(String(lokaal.doc_number).trim());
    if (!h) { console.log(`— ${lokaal.doc_number}: geen Holded-factuur met dit nummer, overslaan`); continue; }
    // Zonder reset alleen omhangen bij een exact gelijk totaal — anders is het
    // niet zeker dat het om dezelfde factuur gaat.
    if (!doel.resetPaid && Number(h.total) !== Number(lokaal.total_eur)) {
      console.log(`— ${lokaal.doc_number}: totaal wijkt af (lokaal ${lokaal.total_eur}, Holded ${h.total}), overslaan`);
      continue;
    }
    if (lokaal.holded_id === h.id) { console.log(`— ${lokaal.doc_number}: koppeling klopt al`); continue; }

    await sql.begin(async (tx) => {
      await tx`update documents set holded_id = ${h.id}, updated_at = now() where id = ${lokaal.id}`;
      if (doel.resetPaid) {
        await tx`update documents set paid_eur = '0.00', updated_at = now() where id = ${lokaal.id}`;
        await tx`delete from project_payments where document_id = ${lokaal.id}`;
      }
      // Sync-map meeverhuizen; de unieke index op holded_id vereist dat een
      // eventuele oude rij voor de nieuwe id eerst weg is.
      await tx`delete from holded_sync_map where entity_type = 'document' and holded_id = ${h.id}`;
      await tx`update holded_sync_map set holded_id = ${h.id}, updated_at = now()
        where entity_type = 'document' and local_id = ${lokaal.id}`;
    });
    console.log(
      `✓ ${lokaal.doc_number}: ${lokaal.holded_id} → ${h.id} (Holded status ${h.status}, betaald ${h.paymentsTotal})` +
        (doel.resetPaid ? " · betaald teruggezet naar € 0, project-ontvangst verwijderd" : ""),
    );
  }

  console.log("\nEINDSTAND:");
  const na = await sql`select doc_number, status, paid_eur, total_eur, holded_id from documents
    where (id = ${LOKAAL_0031} or doc_number in ('F260012','F260013')) and kind = 'invoice' order by doc_number`;
  for (const d of na) console.log(" ", JSON.stringify(d));

  await sql.end();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
