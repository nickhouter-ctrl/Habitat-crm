/**
 * Vult subtotaal en btw aan op inkooporders die ze missen — 10-08-2026.
 *
 * Waarom dit nodig is: de import uit de mail sloeg alleen het TOTAAL op. Het
 * subtotaal en het btw-bedrag las de AI wél uit de factuur, maar die werden
 * weggegooid. Zonder die twee kan `poExVat()` niet bepalen wat de kost ex. btw
 * is; het overzicht toont dan "btw?" en rekent met het volle bedrag INCLUSIEF
 * btw als kostprijs. Op een Spaanse factuur van 21% staat de kost daarmee tot
 * een vijfde te hoog in de projectmarges en de rapportage.
 *
 * Dit script leest de bewaarde factuur opnieuw uit en vult subtotaal + btw aan.
 * Het schrijft alleen als de uitkomst KLOPT met het opgeslagen totaal:
 *   0 < subtotaal ≤ totaal  en  btw = totaal − subtotaal  en  btw ≤ 25% van subtotaal
 * Alles wat daarbuiten valt blijft ongemoeid en wordt gemeld — liever een
 * openstaande "btw?" dan een verkeerd bedrag in de boekhouding.
 *
 * Idempotent: al ingevulde inkooporders slaat hij over.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/backfill-inkoop-btw.ts --dry
 *   ... --limit 10     verwerk er hooguit 10 (elke factuur kost een AI-call)
 */
import "./load-env";

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";

import { extractInvoiceFieldsFromBuffer } from "../lib/ai-invoice-extract";
import { db, pgClient } from "../lib/db";
import { purchaseOrders } from "../lib/db/schema";

const PO_BUCKET = process.env.SUPABASE_PO_BUCKET ?? "purchase-order-files";

type Kandidaat = {
  id: string;
  supplier: string;
  reference: string | null;
  total: string;
  attachments: Array<{ name?: string; path?: string }> | null;
};

const eur = (n: number) => `€ ${n.toFixed(2)}`;

async function main() {
  const dry = process.argv.includes("--dry");
  const limIdx = process.argv.indexOf("--limit");
  const limiet = limIdx >= 0 ? Number(process.argv[limIdx + 1]) || 0 : 0;

  const rijen = (await pgClient`
    select id, supplier, reference, total, attachments
    from purchase_orders
    where subtotal is null and tax is null and total <> 0
      -- CASE, geen losse AND: Postgres mag voorwaarden herordenen en riep
      -- jsonb_array_length dan ook op rijen waar attachments geen array is.
      and (case when jsonb_typeof(attachments) = 'array' then jsonb_array_length(attachments) else 0 end) > 0
    order by order_date desc nulls last
  `) as unknown as Kandidaat[];

  const werk = limiet > 0 ? rijen.slice(0, limiet) : rijen;
  console.log(`${rijen.length} inkooporders zonder btw-uitsplitsing, ${werk.length} worden nu bekeken.\n`);

  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  let gevuld = 0;
  let overgeslagen = 0;
  const twijfel: string[] = [];

  for (const po of werk) {
    const naam = `${po.supplier} · ${po.reference ?? "-"}`;
    const pad = po.attachments?.[0]?.path;
    if (!pad) {
      overgeslagen++;
      continue;
    }
    const total = Number(po.total);

    const { data, error } = await sb.storage.from(PO_BUCKET).download(pad);
    if (error || !data) {
      twijfel.push(`${naam}: bestand niet leesbaar (${error?.message ?? "leeg"})`);
      continue;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    const velden = await extractInvoiceFieldsFromBuffer({
      buffer,
      filename: po.attachments?.[0]?.name ?? "factuur.pdf",
      contentType: data.type || "application/pdf",
    });
    if (!velden) {
      twijfel.push(`${naam}: uitlezen mislukt`);
      continue;
    }

    let subtotaal = velden.subtotal;
    let btw = velden.vatAmount;
    if (subtotaal == null && btw != null) subtotaal = Math.round((total - btw) * 100) / 100;
    if (btw == null && subtotaal != null) btw = Math.round((total - subtotaal) * 100) / 100;

    if (subtotaal == null || btw == null) {
      twijfel.push(`${naam}: geen subtotaal/btw op de factuur (totaal ${eur(total)})`);
      continue;
    }
    // Alleen wegschrijven als het rekenkundig sluit met wat er al staat.
    const sluitAan = Math.abs(subtotaal + btw - total) <= 0.02;
    const plausibel = subtotaal > 0 && subtotaal <= total + 0.02 && btw >= 0 && btw <= subtotaal * 0.25;
    if (!sluitAan || !plausibel) {
      twijfel.push(
        `${naam}: uitkomst wijkt af — subtotaal ${eur(subtotaal)} + btw ${eur(btw)} ≠ totaal ${eur(total)}`,
      );
      continue;
    }

    const pct = subtotaal > 0 ? (btw / subtotaal) * 100 : 0;
    console.log(`${naam}\n   ${eur(total)} incl. → ${eur(subtotaal)} ex. btw + ${eur(btw)} btw (${pct.toFixed(0)}%)`);
    gevuld++;
    if (!dry) {
      await db
        .update(purchaseOrders)
        .set({ subtotal: subtotaal.toFixed(2), tax: btw.toFixed(2), updatedAt: new Date() })
        .where(eq(purchaseOrders.id, po.id));
    }
  }

  console.log(`\n${dry ? "[DRY RUN] " : ""}${gevuld} bijgewerkt, ${overgeslagen} zonder bijlage-pad.`);
  if (twijfel.length) {
    console.log(`\n${twijfel.length} met de hand na te kijken (niets gewijzigd):`);
    for (const t of twijfel) console.log(`  ${t}`);
  }
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
