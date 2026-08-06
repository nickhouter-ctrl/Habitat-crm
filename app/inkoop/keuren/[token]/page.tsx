/**
 * Beoordeel één inkoopfactuur via de knop in de meldingsmail — zonder inloggen.
 *
 * BELANGRIJK: het aanklikken van de link doet nooit zélf iets. Mailscanners van
 * Gmail, Outlook en virusscanners halen links in mail automatisch op om ze te
 * controleren; een link die goedkeurt zou dus facturen goedkeuren die niemand
 * heeft gezien. Deze pagina toont de factuur en het oordeel, en pas een echte
 * knop (POST) neemt het besluit.
 */
import { eq, sql } from "drizzle-orm";
import Link from "next/link";

import { Badge, buttonClass, Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Textarea } from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Combobox } from "@/components/combobox";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { emailInbox, mailAttachments, projects, purchaseInvoiceReviews } from "@/lib/db/schema";
import { buildInvoiceRejectEmail, supplierEmailCandidates } from "@/lib/invoice-reject";
import { isOverheadSupplier } from "@/lib/purchase-invoice-intake";
import { formatEUR } from "@/lib/utils";
import { approveViaTokenAction, rejectViaTokenAction } from "./actions";

export const metadata = { title: "Inkoopfactuur beoordelen" };
export const dynamic = "force-dynamic";

type Check = { key: string; label: string; severity: string; ok: boolean; skipped?: boolean; es: string; internal?: boolean };

export default async function KeurenViaMailPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ gedaan?: string; w?: string }>;
}) {
  const { token } = await params;
  const { gedaan, w } = await searchParams;

  const row = await db
    .select({
      review: purchaseInvoiceReviews,
      attachmentName: mailAttachments.filename,
      subject: emailInbox.subject,
      fromEmail: emailInbox.fromEmail,
      // In de database bepalen, niet tijdens het renderen: een klok uitlezen in
      // een component is geen zuivere functie.
      verlopen: sql<boolean>`coalesce(${purchaseInvoiceReviews.actionTokenExpiresAt} < now(), false)`,
    })
    .from(purchaseInvoiceReviews)
    .innerJoin(mailAttachments, eq(mailAttachments.id, purchaseInvoiceReviews.mailAttachmentId))
    .innerJoin(emailInbox, eq(emailInbox.id, purchaseInvoiceReviews.emailId))
    .where(eq(purchaseInvoiceReviews.actionToken, token))
    .limit(1);

  const found = row[0];
  if (!found) {
    return (
      <Melding title="Link niet geldig">
        Deze link hoort niet bij een factuur. Mogelijk is hij verlopen of al gebruikt. Open de wachtrij in het CRM om de
        factuur alsnog te beoordelen.
      </Melding>
    );
  }

  const v = found.review;
  const verlopen = found.verlopen;

  if (v.status !== "pending" && gedaan) {
    // Net zelf gedaan: bevestigen, niet vermanen.
    return (
      <Melding title={gedaan === "afgekeurd" ? "Afgekeurd en verstuurd" : "Goedgekeurd"}>
        {gedaan === "afgekeurd"
          ? "De factuur is afgekeurd en komt niet in de inkoopadministratie. Is er een bericht aan de leverancier meegestuurd, dan is dat verzonden."
          : "De factuur staat nu als inkooporder in de administratie en telt mee in de projectkosten."}
        {v.purchaseOrderId ? (
          <>
            {" "}
            <Link href={`/inkooporders/${v.purchaseOrderId}`} className="text-accent hover:underline">
              Bekijk de inkooporder
            </Link>
            .
          </>
        ) : null}
      </Melding>
    );
  }

  if (v.status !== "pending") {
    return (
      <Melding title="Al afgehandeld">
        Deze factuur is al {v.status === "approved" ? "goedgekeurd" : v.status === "rejected" ? "afgekeurd" : "afgehandeld"}
        {v.decidedAt ? ` op ${v.decidedAt.toLocaleDateString("nl-NL")}` : ""}
        {v.decidedVia === "mail" ? " via de knop in de melding" : ""}.
        {v.purchaseOrderId ? (
          <>
            {" "}
            <Link href={`/inkooporders/${v.purchaseOrderId}`} className="text-accent hover:underline">
              Bekijk de inkooporder
            </Link>
            .
          </>
        ) : null}
      </Melding>
    );
  }

  if (verlopen) {
    return (
      <Melding title="Link verlopen">
        Deze link is niet meer geldig. Open de wachtrij in het CRM om de factuur te beoordelen.
      </Melding>
    );
  }

  const checks = (Array.isArray(v.findings) ? v.findings : []) as Check[];
  const gefaald = checks.filter((c) => !c.ok && !c.skipped && c.key !== "hours_derived");
  const teMelden = gefaald.filter((c) => !c.internal && c.es);
  const urenAfgeleid = checks.find((c) => c.key === "hours_derived")?.label ?? null;

  const fields = (v.aiFields ?? null) as {
    supplierTaxId?: string | null;
    supplierEmail?: string | null;
    language?: string | null;
  } | null;

  const isOverhead = await isOverheadSupplier(v.proposedSupplier);
  const [projectRows, kandidaten] = await Promise.all([
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(projects.name),
    supplierEmailCandidates({
      emailId: v.emailId,
      supplier: v.proposedSupplier,
      supplierTaxId: fields?.supplierTaxId ?? null,
      invoiceEmail: v.supplierEmail ?? fields?.supplierEmail ?? null,
    }),
  ]);

  const concept = teMelden.length
    ? buildInvoiceRejectEmail({
        lang: (fields?.language as "es" | "nl" | "en" | null) ?? "es",
        supplier: v.proposedSupplier,
        reference: v.proposedReference,
        invoiceDate: v.proposedInvoiceDate,
        missing: teMelden,
      })
    : null;

  const total = v.proposedTotal != null ? Number(v.proposedTotal) : null;
  const subtotal = v.proposedSubtotal != null ? Number(v.proposedSubtotal) : null;

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <Card>
        <CardHeader>
          <CardTitle>{v.proposedSupplier ?? "Inkoopfactuur"}</CardTitle>
          <span className="text-xs text-muted">
            {v.proposedReference ?? "geen referentie"}
            {v.proposedInvoiceDate ? ` · ${v.proposedInvoiceDate}` : ""} · {found.attachmentName}
          </span>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold tabular-nums">{total != null ? formatEUR(total) : "—"}</span>
            {subtotal != null && <span className="text-sm text-muted">ex. btw {formatEUR(subtotal)}</span>}
            <Badge tone={v.verdict === "ok" ? "success" : v.verdict === "reject" ? "danger" : "warning"}>
              {v.verdict === "ok" ? "compleet" : v.verdict === "reject" ? "incompleet" : v.verdict === "unreadable" ? "niet gelezen" : "let op"}
            </Badge>
          </div>

          {gefaald.length > 0 && (
            <div className="rounded-md bg-warning/10 p-3 text-sm">
              <p className="mb-1 font-medium">Wat ontbreekt of opvalt</p>
              <ul className="space-y-0.5">
                {gefaald.map((c) => (
                  <li key={c.key}>
                    {c.severity === "blocking" ? "✗" : "!"} {c.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-sm">
            <a href={`/api/archief/${v.mailAttachmentId}`} className="text-accent hover:underline">
              Factuur openen (PDF)
            </a>
            <span className="ml-2 text-xs text-muted">— inloggen vereist voor de PDF</span>
          </p>

          {/* Goedkeuren */}
          <form action={approveViaTokenAction.bind(null, token)} className="space-y-3 border-t pt-4">
            {/* Wie klikte: komt uit de persoonlijke link in de meldingsmail. */}
            <input type="hidden" name="w" value={w ?? ""} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Project" hint={v.suggestedProjectId ? "herkend op de factuur" : "niet herkend — kies zelf"}>
                <Combobox
                  name="projectId"
                  defaultValue={v.suggestedProjectId ?? ""}
                  clearable
                  placeholder="Zoek een werf…"
                  options={projectRows.map((p) => ({ value: p.id, label: p.name }))}
                />
              </Field>
              <Field label="Soort" htmlFor="kind">
                <Select id="kind" name="kind" defaultValue={v.suggestedKind ?? ""}>
                  <option value="">— kies —</option>
                  <option value="labor">Uren / arbeid</option>
                  <option value="material">Materiaal / inkoop</option>
                </Select>
              </Field>
              <Field label="Uren" htmlFor="hours" hint={urenAfgeleid ?? "alleen bij uren/arbeid"}>
                <Input
                  id="hours"
                  name="hours"
                  inputMode="decimal"
                  className="text-right"
                  defaultValue={v.suggestedHours != null ? String(Number(v.suggestedHours)) : ""}
                />
              </Field>
              <Field label="Totaal (incl. btw)" htmlFor="total">
                <Input
                  id="total"
                  name="total"
                  inputMode="decimal"
                  className="text-right"
                  defaultValue={total != null ? String(total).replace(".", ",") : ""}
                />
              </Field>
            </div>
            {/* Vaste lasten (energie, telefonie, verzekering) horen bij geen werf.
                Eén keer aanvinken en de volgende factuur van deze leverancier
                vraagt er niet meer om. */}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="overhead" defaultChecked={isOverhead} />
              <span>Algemene kosten — hoort bij geen project</span>
            </label>
            <SubmitButton variant="primary" pendingLabel="Goedkeuren…">
              Goedkeuren
            </SubmitButton>
          </form>

          {/* Afkeuren + terugsturen */}
          <details className="border-t pt-4">
            <summary className="cursor-pointer text-sm font-medium">Afkeuren en de leverancier berichten</summary>
            <form action={rejectViaTokenAction.bind(null, token)} className="mt-3 space-y-3">
              <input type="hidden" name="w" value={w ?? ""} />
              <Field label="Interne reden" htmlFor="reason" hint="komt in het logboek, niet in de mail">
                <Textarea
                  id="reason"
                  name="reason"
                  rows={2}
                  required
                  defaultValue={teMelden.length ? `Incompleet: ${teMelden.map((c) => c.label.toLowerCase()).join(", ")}.` : ""}
                />
              </Field>
              {/* Standaard UIT: op deze pagina beland je rechtstreeks vanuit een
                  mailknop, en een vooraf aangevinkt "verstuur" plus voorgevulde
                  reden maakte van één klik een mail aan de leverancier. */}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="sendMail" />
                <span>Terugsturen naar de leverancier (mail hieronder gaat dan direct uit)</span>
              </label>
              <Field label="Aan" htmlFor="mailTo">
                <Select id="mailTo" name="mailTo" defaultValue={kandidaten[0]?.email ?? ""}>
                  {kandidaten.map((c) => (
                    <option key={c.email} value={c.email}>
                      {c.email} — {c.source}
                      {c.uncertain ? " ⚠ mogelijk de doorstuurder" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Onderwerp" htmlFor="mailSubject">
                <Input id="mailSubject" name="mailSubject" defaultValue={concept?.subject ?? ""} />
              </Field>
              <Field label="Bericht" htmlFor="mailBody" hint="dit gaat er letterlijk uit">
                <Textarea id="mailBody" name="mailBody" rows={12} defaultValue={concept?.text ?? ""} />
              </Field>
              <ConfirmSubmit
                message="Als het vinkje 'Terugsturen naar de leverancier' aanstaat, gaat de mail hieronder direct naar de leverancier. Doorgaan?"
                className={buttonClass({ variant: "secondary" })}
              >
                Afkeuren
              </ConfirmSubmit>
            </form>
          </details>

          <p className="border-t pt-3 text-xs text-muted">
            Zolang deze factuur niet is goedgekeurd telt hij niet mee in de projectkosten en gaat hij niet naar Holded.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

function Melding({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-lg p-8">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{children}</p>
          <p>
            <Link href="/inkooporders/te-verwerken" className="text-accent hover:underline">
              Naar de wachtrij in het CRM
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
