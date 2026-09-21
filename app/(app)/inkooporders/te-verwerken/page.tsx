/**
 * De goedkeuringspoort: binnengekomen inkoopfacturen die op beoordeling wachten.
 *
 * Zolang een factuur hier staat, bestaat er géén inkooporder — hij telt dus niet
 * mee in projectkosten, staat niet op het dashboard als openstaande post en gaat
 * niet naar Holded. Dat gebeurt pas bij goedkeuren.
 */
import { asc, desc, eq, ne } from "drizzle-orm";

import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import {
  emailInbox,
  mailAttachments,
  overheadSuppliers,
  overheadSupplierKey,
  projects,
  purchaseInvoiceReviews,
} from "@/lib/db/schema";
import { beoordeelKandidaat } from "@/lib/invoice-learning";
import { buildInvoiceRejectEmail, supplierEmailCandidates, type EmailCandidate } from "@/lib/invoice-reject";
import { formatEUR } from "@/lib/utils";
import { ReviewCard, type ReviewCardData, type ReviewCheck, type ReviewLine } from "./review-card";
import { alleAliassen, zoektermenPerProject } from "@/lib/project-aliases";

export const metadata = { title: "Facturen keuren — inkoop" };
export const dynamic = "force-dynamic";

const fmtDate = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—";

const dagenSinds = (d: Date | string | null) =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000) : 0;

export default async function FacturenKeurenPage() {
  const [rows, projectRijen, aliassen] = await Promise.all([
    db
      .select({
        review: purchaseInvoiceReviews,
        attachmentName: mailAttachments.filename,
        attachmentType: mailAttachments.contentType,
        attachmentSize: mailAttachments.sizeBytes,
        mailId: emailInbox.id,
        subject: emailInbox.subject,
        fromEmail: emailInbox.fromEmail,
        fromName: emailInbox.fromName,
        receivedAt: emailInbox.receivedAt,
      })
      .from(purchaseInvoiceReviews)
      .innerJoin(mailAttachments, eq(mailAttachments.id, purchaseInvoiceReviews.mailAttachmentId))
      .innerJoin(emailInbox, eq(emailInbox.id, purchaseInvoiceReviews.emailId))
      .where(eq(purchaseInvoiceReviews.status, "pending"))
      .orderBy(desc(emailInbox.receivedAt)),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(ne(projects.status, "archived"))
      .orderBy(asc(projects.name)),
    alleAliassen(),
  ]);

  // De namen die leveranciers zelf voor een werf gebruiken, zodat je in het
  // verdeelveld kunt typen wat er op hun urenlijst staat.
  const aliasTermen = zoektermenPerProject(aliassen);
  const projectRows = projectRijen.map((p) => ({ ...p, aliassen: aliasTermen.get(p.id) }));

  // Wat leert de wachtrij van eerdere keuringen? Items die sterk lijken op wat
  // eerder is weggezet (een logo uit een mail, een urenstaat) krijgen een
  // waarschuwing en zakken naar onderen — ze verdwijnen nooit.
  const beoordelingen = new Map<string, { kans: number; redenen: string[] }>();
  await Promise.all(
    rows.map(async (r) => {
      const b = await beoordeelKandidaat({
        fromEmail: r.fromEmail,
        filename: r.attachmentName,
        contentType: r.attachmentType,
        sizeBytes: r.attachmentSize,
        verdict: r.review.verdict,
        heeftBedrag: r.review.proposedTotal != null,
      });
      if (b.slaOver || b.twijfel) beoordelingen.set(r.review.id, { kans: b.kansGeenFactuur, redenen: b.redenen });
    }),
  );

  // Adressen en conceptmail per factuur voorbereiden. Dit gebeurt hier op de
  // server, zodat het scherm de tekst direct kan tonen zonder extra ronde.
  const extras = new Map<string, { candidates: EmailCandidate[]; draft: { subject: string; text: string } | null }>();
  await Promise.all(
    rows.map(async (r) => {
      const v = r.review;
      const f = (v.aiFields ?? null) as {
        supplierTaxId?: string | null;
        supplierEmail?: string | null;
        language?: string | null;
      } | null;
      const candidates = await supplierEmailCandidates({
        emailId: v.emailId,
        fromEmail: r.fromEmail,
        supplier: v.proposedSupplier,
        supplierTaxId: f?.supplierTaxId ?? null,
        invoiceEmail: v.supplierEmail ?? f?.supplierEmail ?? null,
      });
      const checks = (Array.isArray(v.findings) ? v.findings : []) as ReviewCheck[];
      const missing = checks.filter((c) => !c.ok && !c.skipped && !c.internal && c.es);
      const draft = missing.length
        ? (() => {
            const m = buildInvoiceRejectEmail({
              lang: (f?.language as "es" | "nl" | "en" | null) ?? "es",
              supplier: v.proposedSupplier,
              reference: v.proposedReference,
              invoiceDate: v.proposedInvoiceDate,
              missing,
            });
            return { subject: m.subject, text: m.text };
          })()
        : null;
      extras.set(v.id, { candidates, draft });
    }),
  );

  // Leveranciers die al als vaste last bekend staan (energie, telefonie): dan
  // staat het vinkje "algemene kosten" meteen goed.
  const overheadKeys = new Set(
    (await db.select({ key: overheadSuppliers.supplierKey }).from(overheadSuppliers)).map((o) => o.key),
  );

  // Eén kaart per mail; een mail kan meerdere facturen bevatten (Allpack stuurt
  // goederen, handling en vracht in één bericht).
  const perMail = new Map<
    string,
    { subject: string | null; from: string; receivedAt: Date | string | null; items: ReviewCardData[] }
  >();
  for (const r of rows) {
    const groep =
      perMail.get(r.mailId) ??
      {
        subject: r.subject,
        from: r.fromName ? `${r.fromName} <${r.fromEmail ?? ""}>` : (r.fromEmail ?? "onbekend"),
        receivedAt: r.receivedAt,
        items: [] as ReviewCardData[],
      };
    const v = r.review;
    const fields = (v.aiFields ?? null) as { lines?: ReviewLine[] } | null;
    groep.items.push({
      id: v.id,
      supplier: v.proposedSupplier,
      reference: v.proposedReference,
      total: v.proposedTotal != null ? Number(v.proposedTotal) : null,
      subtotal: v.proposedSubtotal != null ? Number(v.proposedSubtotal) : null,
      currency: v.proposedCurrency,
      totalOriginal: v.proposedTotalOriginal != null ? Number(v.proposedTotalOriginal) : null,
      fxRate: v.fxRate != null ? Number(v.fxRate) : null,
      invoiceDate: v.proposedInvoiceDate,
      verdict: (v.verdict ?? "pending") as ReviewCardData["verdict"],
      checks: (Array.isArray(v.findings) ? v.findings : []) as ReviewCheck[],
      projectId: v.suggestedProjectId,
      kind: (v.suggestedKind as "labor" | "material" | null) ?? null,
      hours: v.suggestedHours != null ? Number(v.suggestedHours) : null,
      // Al bekend als vaste last? Dan staat het vinkje meteen goed.
      overhead: overheadKeys.has(overheadSupplierKey(v.proposedSupplier ?? "")),
      lines: Array.isArray(fields?.lines) ? (fields.lines as ReviewLine[]) : [],
      attachmentId: v.mailAttachmentId,
      attachmentName: r.attachmentName,
      duplicateOfPoId: v.duplicateOfPoId,
      supplierEmail: v.supplierEmail,
      emailCandidates: extras.get(v.id)?.candidates ?? [],
      draft: extras.get(v.id)?.draft ?? null,
      wachtDagen: dagenSinds(r.receivedAt),
      twijfel: beoordelingen.get(v.id) ?? null,
      siblings: [],
    });
    perMail.set(r.mailId, groep);
  }
  // Bij meerdere facturen in één mail kan een kaart een specificatie
  // (urenverantwoording, pakbon) bij een andere zijn — geef elke kaart zijn
  // mail-genoten mee zodat de "bijlage bij …"-knop kan verschijnen.
  for (const groep of perMail.values()) {
    for (const item of groep.items) {
      item.siblings = groep.items
        .filter((x) => x.id !== item.id)
        .map((x) => ({ id: x.id, label: x.reference ?? x.attachmentName }));
    }
  }

  const totaal = rows.reduce((s, r) => s + (r.review.proposedTotal != null ? Number(r.review.proposedTotal) : 0), 0);
  const afkeuren = rows.filter((r) => r.review.verdict === "reject").length;
  const onleesbaar = rows.filter((r) => r.review.verdict === "unreadable").length;
  const oudste = rows.reduce((max, r) => Math.max(max, dagenSinds(r.receivedAt)), 0);

  return (
    <>
      <PageHeader
        title="Facturen keuren"
        subtitle={
          rows.length === 0
            ? "Geen inkoopfacturen die op beoordeling wachten."
            : `${rows.length} factu${rows.length === 1 ? "ur" : "ren"} · ${formatEUR(totaal)} · pas na goedkeuring komen ze in de inkoop`
        }
        actions={
          <LinkButton href="/inkooporders" variant="ghost">
            ← Inkooporders
          </LinkButton>
        }
      />

      {rows.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2 text-xs">
          {afkeuren > 0 && <Badge tone="danger">{afkeuren} incompleet — terugsturen</Badge>}
          {onleesbaar > 0 && <Badge tone="neutral">{onleesbaar} niet gelezen — handmatig bekijken</Badge>}
          {oudste >= 7 && <Badge tone="warning">oudste wacht {oudste} dagen</Badge>}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="Niets te keuren"
          description="Zodra er een factuur op purchase@habitat-one.com binnenkomt, wordt die uitgelezen en verschijnt hij hier. Tot je 'm goedkeurt telt hij niet mee in de projectkosten en gaat hij niet naar Holded."
          action={<LinkButton href="/inkooporders">Naar inkooporders</LinkButton>}
        />
      ) : (
        <div className="grid gap-5">
          {[...perMail.entries()]
            // Mails waarvan élk item "waarschijnlijk geen factuur" is, zakken naar
            // onderen. Ze blijven staan: het model mag zich vergissen.
            .sort(([, a], [, b]) => Number(a.items.every((x) => x.twijfel)) - Number(b.items.every((x) => x.twijfel)))
            .map(([mailId, groep]) => (
            <Card key={mailId} id={`mail-${mailId}`} className="scroll-mt-20">
              <CardHeader>
                <CardTitle>{groep.subject || "(geen onderwerp)"}</CardTitle>
                <span className="text-xs text-muted">
                  van {groep.from} · {fmtDate(groep.receivedAt)}
                  {groep.items.length > 1 ? ` · ${groep.items.length} facturen in deze mail` : ""}
                </span>
              </CardHeader>
              <CardContent className="space-y-4">
                {groep.items.map((item) => (
                  <ReviewCard key={item.id} data={item} projects={projectRows} />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
