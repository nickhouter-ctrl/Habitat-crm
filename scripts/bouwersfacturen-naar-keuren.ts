/**
 * Zet de bouwersfacturen die nooit in "facturen keuren" belandden alsnog in de
 * wachtrij — 12-08-2026.
 *
 * Waarom ze bleven liggen: de goedkeuringspoort verwerkt alleen bijlagen in een
 * FINANCIËLE categorie, en de indeler kende Ahmed Bouzekri, Ferhaoui, Zerghini
 * en Wilhelmus niet. Hun facturen kregen categorie "other" en werden dus
 * overgeslagen, ook al gingen ze netjes naar purchase@. De indeler is
 * bijgewerkt (regel "contractor" in lib/email-attachments.ts); dit script haalt
 * de achterstand op.
 *
 * Twee stappen:
 *  1. Hercategoriseren: elke bijlage opnieuw door `detectCategory`. Alleen
 *     wijzigen wanneer de nieuwe uitkomst FINANCIEEL is en de oude "other" was
 *     — nooit een al goed ingedeelde bijlage omkatten.
 *  2. Voor de nu-financiële bijlagen zonder inkooporder en zonder keurregel het
 *     voorstel bouwen en in de wachtrij zetten. `buildInvoiceProposal` zoekt
 *     zelf naar een bestaande inkooporder en markeert een treffer als duplicaat,
 *     zodat al geboekte facturen herkenbaar blijven in plaats van dubbel te gaan.
 *
 * Elke factuur kost een AI-uitlezing (~10 s). Idempotent: al verwerkte bijlagen
 * worden overgeslagen.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/bouwersfacturen-naar-keuren.ts --dry
 *   ... --limit 10
 */
import "./load-env";

import { eq } from "drizzle-orm";

import { buildInvoiceProposal, FINANCIAL_CATEGORIES, isProformaOrQuote, upsertInvoiceReview } from "../lib/purchase-invoice-intake";
import { db, pgClient } from "../lib/db";
import { detectCategory } from "../lib/email-attachments";
import { mailAttachments } from "../lib/db/schema";

type Rij = {
  att_id: string;
  email_id: string;
  filename: string;
  content_type: string | null;
  category: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  body_text: string | null;
  received_at: string;
  heeft_po: boolean;
  heeft_review: boolean;
};

const financieel = (c: string) => (FINANCIAL_CATEGORIES as readonly string[]).includes(c);

async function main() {
  const dry = process.argv.includes("--dry");
  const limIdx = process.argv.indexOf("--limit");
  const limiet = limIdx >= 0 ? Number(process.argv[limIdx + 1]) || 0 : 0;

  const rijen = (await pgClient`
    select a.id as att_id, a.email_id, a.filename, a.content_type, a.category,
           e.from_email, e.from_name, e.subject, e.body_text, e.received_at,
           (e.linked_purchase_order_id is not null) as heeft_po,
           (r.id is not null) as heeft_review
    from mail_attachments a
    join email_inbox e on e.id = a.email_id
    left join purchase_invoice_reviews r on r.mail_attachment_id = a.id
    where e.status <> 'archived'
    order by e.received_at desc
  `) as unknown as Rij[];

  /* ── 1. Hercategoriseren ─────────────────────────────────────────────── */
  let herzien = 0;
  const nuFinancieel: Rij[] = [];
  for (const r of rijen) {
    const nieuw = detectCategory({
      filename: r.filename,
      contentType: r.content_type ?? "",
      fromEmail: r.from_email ?? "",
      fromName: r.from_name ?? "",
      subject: r.subject ?? "",
      allText: `${r.subject ?? ""} ${r.body_text ?? ""}`,
    });
    // Alleen ophogen van "other" naar financieel; nooit een bestaande, bewuste
    // indeling overschrijven. En alleen de AANNEMERS: het opnieuw indelen legt
    // ook een bredere achterstand bloot (Obramat, Iberdrola, doorgestuurde
    // inkoopfacturen), maar die hoort bij een eigen besluit — niet als
    // bijvangst van deze opruiming.
    if (nieuw !== r.category && r.category === "other" && nieuw === "contractor") {
      console.log(`  ${r.filename.slice(0, 50).padEnd(50)} other → ${nieuw}`);
      herzien++;
      if (!dry) {
        await db.update(mailAttachments).set({ category: nieuw }).where(eq(mailAttachments.id, r.att_id));
      }
      nuFinancieel.push({ ...r, category: nieuw });
    } else if (financieel(r.category)) {
      nuFinancieel.push(r);
    }
  }
  console.log(`\n${herzien} bijlagen opnieuw ingedeeld naar een financiële categorie.`);

  /* ── 2. In de keurwachtrij zetten ────────────────────────────────────── */
  // Standaard alleen de aannemers — dat is waar deze opruiming over gaat. Met
  // --alles pak je élke financiële bijlage zonder inkooporder; dat is een veel
  // grotere achterstand (Obramat, Iberdrola, doorgestuurde inkoopfacturen) en
  // hoort een eigen besluit te zijn.
  const alles = process.argv.includes("--alles");
  const tedoen = nuFinancieel.filter(
    (r) =>
      !r.heeft_po &&
      !r.heeft_review &&
      !isProformaOrQuote(r.filename) &&
      (alles || r.category === "contractor"),
  );
  const werk = limiet > 0 ? tedoen.slice(0, limiet) : tedoen;
  console.log(`${tedoen.length} zonder inkooporder en zonder keurregel; ${werk.length} worden nu verwerkt.\n`);

  let gezet = 0;
  let duplicaat = 0;
  const fouten: string[] = [];
  for (const r of werk) {
    try {
      const voorstel = await buildInvoiceProposal({ emailId: r.email_id, attachmentId: r.att_id });
      if (!voorstel) {
        fouten.push(`${r.filename}: geen voorstel`);
        continue;
      }
      const dup = voorstel.duplicateOfPoId ? " · DUPLICAAT van bestaande inkooporder" : "";
      if (voorstel.duplicateOfPoId) duplicaat++;
      console.log(
        `  ${String(r.received_at).slice(0, 10)} ${(voorstel.supplier ?? "onbekend").slice(0, 24).padEnd(24)} ` +
          `${(voorstel.reference ?? "").slice(0, 26).padEnd(26)} ` +
          `${voorstel.total != null ? `€ ${voorstel.total.toFixed(2)}`.padStart(12) : "         —  "} ` +
          `${voorstel.verdict.status}${dup}`,
      );
      if (!dry) await upsertInvoiceReview(voorstel, "auto");
      gezet++;
    } catch (e) {
      fouten.push(`${r.filename}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\n${dry ? "[DRY RUN] " : ""}${gezet} in de keurwachtrij gezet, waarvan ${duplicaat} als duplicaat gemarkeerd.`);
  if (fouten.length) {
    console.log(`${fouten.length} mislukt:`);
    for (const f of fouten) console.log(`  ${f}`);
  }
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
