/**
 * Betaalstatus van inkooporders overnemen uit Holded (verzoek Nick 19-08).
 *
 * Voor elke lokale inkooporder mét holded_id die hier nog onbetaald staat:
 * haal het purchase-document uit Holded en neem de betaling over —
 * status 1 = volledig betaald (paid_at + paid_eur), status 2 of
 * paymentsTotal > 0 = deelbetaling (alleen paid_eur). Zelfde conventies als
 * de bestaande sync (lib/holded/sync.ts), inclusief:
 *  - nummer-guard (geest van 8c14574): wijkt het Holded-docNumber af van de
 *    lokale referentie, dan slaan we over en melden dat — geen betaling van
 *    een verkeerd gekoppeld document overnemen;
 *  - valuta: bedragen via currencyChange terug naar EUR;
 *  - paid_at/paid_eur alleen VOORUIT (bestaande waarden blijven staan).
 *
 * Dry-run standaard; `--apply` schrijft echt.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const APPLY = process.argv.includes("--apply");
const r2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  const postgres = (await import("postgres")).default;
  const { holded, HoldedError } = await import("../lib/holded/client");
  const sql = postgres(process.env.DATABASE_URL!);

  try {
    const rows = await sql`
      select id, supplier, reference, total, paid_eur, holded_id
      from purchase_orders
      where holded_id is not null and paid_at is null
      order by order_date`;
    console.log(`${rows.length} gekoppelde inkooporders staan lokaal op onbetaald.\n`);

    let volledig = 0, deels = 0, onbetaald = 0, dood = 0, mismatch = 0;
    for (const row of rows) {
      let doc;
      try {
        doc = await holded.documents.get("purchase", row.holded_id as string);
      } catch (err) {
        // Holded geeft voor verdwenen documenten soms 400 met info "not found".
        const notFound = err instanceof HoldedError &&
          (err.status === 404 || (err.status === 400 && /not found/i.test(JSON.stringify(err.body ?? ""))));
        if (notFound) {
          console.log(`DODE LINK    ${row.supplier} | ${row.reference ?? "(geen ref)"} | Holded-doc ${row.holded_id} bestaat niet meer`);
          dood++;
          continue;
        }
        throw err;
      }
      const d = doc as {
        docNumber?: string; status?: number; total?: number;
        paymentsTotal?: number; currency?: string; currencyChange?: number;
      };

      // Nummer-guard: lokale referentie kwam oorspronkelijk uit ditzelfde veld.
      const ref = (row.reference as string | null)?.trim();
      const docNum = d.docNumber?.trim();
      if (ref && docNum && ref !== docNum) {
        console.log(`NUMMER WIJKT AF  ${row.supplier} | lokaal "${ref}" vs Holded "${docNum}" (${row.holded_id}) — overgeslagen, koppeling controleren`);
        mismatch++;
        continue;
      }

      const isEur = (d.currency ?? "EUR") === "EUR";
      const rate = Number(d.currencyChange) || 1;
      const toEur = (v: unknown) => (isEur ? Number(v ?? 0) : r2(Number(v ?? 0) / rate));
      const betaald = toEur(d.paymentsTotal);
      const volledigBetaald = d.status === 1;

      if (!volledigBetaald && betaald <= 0) {
        onbetaald++;
        continue;
      }

      // Sanity-check: betaald bedrag hoort bij het lokale totaal in de buurt te
      // liggen. Fors erboven = vrijwel zeker een verkeerde koppeling — melden,
      // niet schrijven.
      const lokaalTotaal = Number(row.total ?? 0);
      const paidEur = betaald !== 0 ? betaald : toEur(d.total);
      // Status 1 zonder enig bedrag (leeg Holded-doc): geen bewijs van betaling.
      if (paidEur === 0) {
        console.log(`GEEN BEDRAG  ${row.supplier} | ${ref ?? "(geen ref)"} | Holded zegt betaald maar zonder bedrag/totaal — overgeslagen, doc in Holded controleren`);
        mismatch++;
        continue;
      }
      if (lokaalTotaal > 0 && paidEur > lokaalTotaal * 1.5) {
        console.log(`AFWIJKEND    ${row.supplier} | ${ref ?? "(geen ref)"} | lokaal € ${lokaalTotaal} maar Holded betaald € ${paidEur.toFixed(2)} — overgeslagen, koppeling controleren`);
        mismatch++;
        continue;
      }
      const label = volledigBetaald ? "BETAALD" : "DEELBETALING";
      console.log(`${label.padEnd(13)} ${String(row.supplier).slice(0, 30).padEnd(31)} ${(ref ?? "(geen ref)").padEnd(20)} € ${String(row.total).padStart(10)} → betaald € ${paidEur.toFixed(2)}`);

      if (APPLY) {
        await sql`
          update purchase_orders set
            paid_eur = coalesce(paid_eur, ${String(paidEur)}),
            paid_at = ${volledigBetaald ? new Date() : null},
            updated_at = now()
          where id = ${row.id} and paid_at is null`;
      }
      if (volledigBetaald) volledig++; else deels++;
    }

    console.log(`\n${volledig} volledig betaald, ${deels} deelbetaling, ${onbetaald} echt onbetaald, ${dood} dode links, ${mismatch} nummer-afwijkingen.`);
    console.log(APPLY ? "Wijzigingen zijn doorgevoerd." : "DRY-RUN — niets gewijzigd. Draai met --apply om door te voeren.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
