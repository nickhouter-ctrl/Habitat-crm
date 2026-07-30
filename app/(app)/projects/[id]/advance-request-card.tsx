/**
 * "Voorschot opvragen" — de brief die de boekhouder voorschrijft, per project.
 *
 * Twee stappen, bewust: eerst bedrag/termijn/datum invullen (GET, dus geen
 * verborgen toestand), dan het concept nalezen en versturen. Wat in het
 * tekstvak staat gaat er letterlijk uit — hetzelfde stramien als het
 * afkeurscherm van de inkoopfacturen, waar dat zich bewijst.
 */
import { and, desc, eq, like } from "drizzle-orm";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { companies, contacts, sentEmails, users } from "@/lib/db/schema";
import { buildAdvanceRequestEmail } from "@/lib/advance-request";
import { formatEUR } from "@/lib/utils";
import { sendAdvanceRequest } from "../actions";

/**
 * De termijn uit het mailonderwerp vissen. Het onderwerp is
 * "Voorschot: <werf> conform overeenkomst <datum> <termijn>"; alles vóór de
 * datum is ruis in een lijstje op de projectpagina — je weet al welk project je
 * bekijkt. Lukt het niet, dan tonen we het onderwerp zoals het is.
 */
function termijnUit(subject: string | null): string {
  const s = (subject ?? "").replace(/^Voorschot:\s*/, "");
  const m = s.match(/conform overeenkomst\s+\d{2}-\d{2}-\d{4}\s+(.*)$/);
  return (m?.[1] ?? s).trim() || "voorschotverzoek";
}

/** Bedrag uit de URL: "50000" of "50.000,00" of "50000.00". */
function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function AdvanceRequestCard({
  projectId,
  projectName,
  siteAlias,
  contactId,
  contractDate,
  params,
}: {
  projectId: string;
  projectName: string;
  siteAlias: string | null;
  contactId: string | null;
  contractDate: string | null;
  params: { vbedrag?: string; vtermijn?: string; vdatum?: string; vmail?: string };
}) {
  const amount = parseAmount(params.vbedrag);
  const termLabel = params.vtermijn?.trim() || "";
  const agreementDate = params.vdatum?.trim() || contractDate;

  const [klant, ondertekenaar, eerder] = await Promise.all([
    contactId
      ? db
          .select({
            name: contacts.name,
            email: contacts.email,
            taxId: contacts.taxId,
            companyName: companies.name,
            companyVat: companies.vatNumber,
            companyEmail: companies.email,
          })
          .from(contacts)
          .leftJoin(companies, eq(companies.id, contacts.companyId))
          .where(eq(contacts.id, contactId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null,
    auth().then(async (s) => {
      const id = s?.user?.id;
      if (!id) return null;
      const row = await db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, id)).limit(1);
      return row[0] ?? null;
    }),
    // Wat er eerder is opgevraagd — hier terug te vinden, niet alleen op de klantkaart.
    db
      .select({
        id: sentEmails.id,
        subject: sentEmails.subject,
        toEmail: sentEmails.toEmail,
        amountEur: sentEmails.amountEur,
        createdAt: sentEmails.createdAt,
      })
      .from(sentEmails)
      .where(and(eq(sentEmails.projectId, projectId), like(sentEmails.subject, "Voorschot: %")))
      .orderBy(desc(sentEmails.createdAt))
      .limit(10),
  ]);

  // De klant zoals de boekhouder hem in de brief wil: bij een vennootschap de
  // statutaire naam met NIF/CIF, anders de contactpersoon.
  const clientName = klant?.companyName ?? klant?.name ?? null;
  const clientTaxId = klant?.companyVat ?? klant?.taxId ?? null;
  const to = klant?.email ?? klant?.companyEmail ?? null;

  // De werf zoals de klant hem kent. Alleen het EERSTE deel van de alias: die
  // bevat vaak alle schrijfwijzen achter elkaar ("Gershwin 39c, Villa Gershwin,
  // Balcón al Mar C 39, Bacon del Mar") en dan wordt de brief onleesbaar.
  const projectLabel = siteAlias?.split(",")[0]?.trim() || projectName;

  const concept =
    amount != null && termLabel
      ? buildAdvanceRequestEmail({
          projectLabel,
          termLabel,
          amountEur: amount,
          agreementDate,
          clientName,
          senderName: ondertekenaar?.name ?? null,
          senderPhone: ondertekenaar?.phone ?? null,
          dateLabel: new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" }),
        })
      : null;

  return (
    <Card id="voorschot-opvragen" className="mb-5 scroll-mt-24">
      <CardHeader>
        <CardTitle>Voorschot opvragen</CardTitle>
        <span className="text-xs text-muted">
          brief in Nederlands én Spaans, zoals de boekhouder hem wil · na ontvangst het bedrag boeken bij Ontvangen
          betalingen
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {params.vmail === "ok" && (
          <p className="rounded-md bg-success/10 p-3 text-sm">Het voorschotverzoek is verstuurd{to ? ` naar ${to}` : ""}.</p>
        )}
        {params.vmail === "mislukt" && (
          <p className="rounded-md bg-danger/10 p-3 text-sm">
            Versturen is niet gelukt. Controleer het adres en of de mailinstellingen kloppen.
          </p>
        )}
        {params.vmail === "geenadres" && (
          <p className="rounded-md bg-warning/10 p-3 text-sm">
            Deze klant heeft geen e-mailadres. Vul het aan bij de klantgegevens, of vul hieronder zelf een adres in.
          </p>
        )}

        {eerder.length > 0 && (
          <div className="rounded-md border bg-background/50 p-3 text-sm">
            <p className="mb-1 text-xs font-medium text-muted">Eerder opgevraagd</p>
            <ul className="space-y-1">
              {eerder.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="tabular-nums text-xs text-muted">
                    {m.createdAt.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span className="font-medium tabular-nums">
                    {m.amountEur != null ? formatEUR(Number(m.amountEur)) : "bedrag onbekend"}
                  </span>
                  <Link href={`/sent-mail/${m.id}`} className="text-accent hover:underline">
                    {/* Alleen de termijn, niet de hele werf + overeenkomstdatum die
                        ook in het onderwerp staan — die regel werd anders een zin. */}
                    {termijnUit(m.subject)}
                  </Link>
                  <span className="text-xs text-muted">→ {m.toEmail}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Is het bedrag binnen? Boek het bij Ontvangen betalingen en maak dan het formele stuk:{" "}
              <Link
                href={`/documents/new?kind=fondos&projectId=${projectId}${contactId ? `&contactId=${contactId}` : ""}`}
                className="text-accent hover:underline"
              >
                + Provisión de fondos
              </Link>
              .
            </p>
          </div>
        )}

        {/* Stap 1 — wat vragen we op? GET, zodat er niets stiekem wordt bewaard. */}
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-end">
          <Field label="Termijn" hint="komt letterlijk in de brief">
            <Input name="vtermijn" defaultValue={termLabel} placeholder="1e & 2e termijn" required />
          </Field>
          <Field label="Bedrag (€)">
            <Input name="vbedrag" inputMode="decimal" defaultValue={params.vbedrag ?? ""} placeholder="50.000,00" required />
          </Field>
          <Field label="Overeenkomst" hint={contractDate ? "van het project" : "optioneel"}>
            <Input name="vdatum" type="date" defaultValue={agreementDate ?? ""} />
          </Field>
          <SubmitButton size="sm" variant="secondary" pendingLabel="…">
            Concept opstellen
          </SubmitButton>
        </form>

        {concept && (
          <form action={sendAdvanceRequest.bind(null, projectId)} className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>
                <span className="text-muted">Bedrag:</span>{" "}
                <strong className="tabular-nums">{formatEUR(amount ?? 0)}</strong>
              </span>
              <span>
                <span className="text-muted">Werf:</span> {projectLabel}
              </span>
              <span>
                <span className="text-muted">Aan:</span> {clientName ?? "onbekend"}
                {clientTaxId ? ` · ${clientTaxId}` : ""}
              </span>
              <span>
                <span className="text-muted">Referentie:</span> {concept.reference}
              </span>
            </div>

            {/* De HTML wordt server-side uit de bewerkte tekst opgebouwd: wat hier
                gelezen is, is wat er uitgaat — geen tweede versie die meelift. */}
            <input type="hidden" name="amountEur" value={String(amount)} />
            <input type="hidden" name="termLabel" value={termLabel} />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Aan" htmlFor="to">
                <Input id="to" name="to" type="email" defaultValue={to ?? ""} required />
              </Field>
              <Field label="Onderwerp" htmlFor="subject">
                <Input id="subject" name="subject" defaultValue={concept.subject} required />
              </Field>
            </div>
            <Field label="Brief" htmlFor="text" hint="dit gaat er letterlijk uit — Nederlands en Spaans">
              <Textarea id="text" name="text" rows={26} defaultValue={concept.text} className="font-mono text-xs" />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton variant="primary" pendingLabel="Versturen…">
                Versturen naar de klant
              </SubmitButton>
              <span className="text-xs text-muted">
                Het formele stuk (provisión de fondos of voorschotfactuur) maak je pas ná ontvangst.
              </span>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
