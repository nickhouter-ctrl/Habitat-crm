/**
 * "Voorschot opvragen" — de brief die de boekhouder voorschrijft, per project.
 *
 * Twee stappen, bewust: eerst bedrag/termijn/datum invullen (GET, dus geen
 * verborgen toestand), dan het concept nalezen en versturen. Wat in het
 * tekstvak staat gaat er letterlijk uit — hetzelfde stramien als het
 * afkeurscherm van de inkoopfacturen, waar dat zich bewijst.
 */
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle, Field, Input, LinkButton, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { companies, contacts, projectPayments, sentEmails, users } from "@/lib/db/schema";
import { buildAdvanceReminderEmail, buildAdvanceRequestEmail, buildAdvanceStatusEmail } from "@/lib/advance-request";
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
  kostenTotaal,
  ontvangenEx,
  aanneemsom,
  doorTeBelasten,
  params,
}: {
  projectId: string;
  projectName: string;
  siteAlias: string | null;
  contactId: string | null;
  contractDate: string | null;
  /** Arbeid + inkoop + kostprijs van geleverde producten (ex. btw). */
  kostenTotaal: number;
  /** Alles wat er binnen is (ex. btw). */
  ontvangenEx: number;
  /** Aanneemsom/doel en wat er minimaal doorbelast moet worden. */
  aanneemsom: number;
  doorTeBelasten: number;
  params: { vbedrag?: string; vtermijn?: string; vdatum?: string; vmail?: string; vstand?: string; vrestant?: string };
}) {
  // Tekort afgerond op duizendtallen: een voorschot vraag je niet op de cent.
  const tekortAfgerond = Math.max(0, Math.ceil((kostenTotaal - ontvangenEx) / 1000) * 1000);
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

  // Wat er op elk verzoek al binnen is. Een klant betaalt een voorschot soms in
  // delen, dus "opgevraagd" zegt op zichzelf niets over wat er staat.
  const ontvangenPerVerzoek = new Map<string, number>();
  if (eerder.length > 0) {
    const rijen = await db
      .select({
        advanceRequestId: projectPayments.advanceRequestId,
        som: sql<number>`coalesce(sum(${projectPayments.amountEur}), 0)::float8`,
      })
      .from(projectPayments)
      .where(
        and(
          eq(projectPayments.projectId, projectId),
          inArray(
            projectPayments.advanceRequestId,
            eerder.map((e) => e.id),
          ),
        ),
      )
      .groupBy(projectPayments.advanceRequestId);
    for (const r of rijen) if (r.advanceRequestId) ontvangenPerVerzoek.set(r.advanceRequestId, Number(r.som));
  }

  // De klant zoals de boekhouder hem in de brief wil: bij een vennootschap de
  // statutaire naam met NIF/CIF, anders de contactpersoon.
  const clientName = klant?.companyName ?? klant?.name ?? null;
  const clientTaxId = klant?.companyVat ?? klant?.taxId ?? null;
  const to = klant?.email ?? klant?.companyEmail ?? null;

  // De werf zoals de klant hem kent. Alleen het EERSTE deel van de alias: die
  // bevat vaak alle schrijfwijzen achter elkaar ("Gershwin 39c, Villa Gershwin,
  // Balcón al Mar C 39, Bacon del Mar") en dan wordt de brief onleesbaar.
  const projectLabel = siteAlias?.split(",")[0]?.trim() || projectName;

  // Stand doorgeven na een deelbetaling: bevestigen wat binnen is, herinneren
  // aan het restant. Alleen mogelijk als er ook echt iets ontvangen is.
  const standVerzoek = params.vstand ? eerder.find((e) => e.id === params.vstand) : null;
  const standBinnen = standVerzoek ? (ontvangenPerVerzoek.get(standVerzoek.id) ?? 0) : 0;
  const standGevraagd = standVerzoek?.amountEur != null ? Number(standVerzoek.amountEur) : 0;
  const standConcept =
    standVerzoek && standGevraagd > 0 && standBinnen > 0
      ? buildAdvanceStatusEmail({
          projectLabel,
          termLabel: termijnUit(standVerzoek.subject),
          amountEur: standGevraagd,
          receivedEur: standBinnen,
          openEur: Math.round((standGevraagd - standBinnen) * 100) / 100,
          agreementDate,
          clientName,
          senderName: ondertekenaar?.name ?? null,
          senderPhone: ondertekenaar?.phone ?? null,
          dateLabel: new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" }),
        })
      : null;

  // Het verzoek om het restant is een APARTE stap: de bevestiging hierboven mag
  // niet als aanmaning lezen terwijl de klant net betaald heeft.
  const restantVerzoek = params.vrestant ? eerder.find((e) => e.id === params.vrestant) : null;
  const restantBinnen = restantVerzoek ? (ontvangenPerVerzoek.get(restantVerzoek.id) ?? 0) : 0;
  const restantGevraagd = restantVerzoek?.amountEur != null ? Number(restantVerzoek.amountEur) : 0;
  const restantConcept =
    restantVerzoek && restantGevraagd > 0
      ? buildAdvanceReminderEmail({
          projectLabel,
          termLabel: termijnUit(restantVerzoek.subject),
          amountEur: restantGevraagd,
          receivedEur: restantBinnen,
          openEur: Math.round((restantGevraagd - restantBinnen) * 100) / 100,
          agreementDate,
          clientName,
          senderName: ondertekenaar?.name ?? null,
          senderPhone: ondertekenaar?.phone ?? null,
          dateLabel: new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" }),
        })
      : null;

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
        {/* De aanleiding om een voorschot te vragen: schieten we voor? Niet de
            verkoopwaarde maar ONZE KOSTEN tegenover wat er binnen is. */}
        <div className={`rounded-lg border p-3 ${ontvangenEx >= kostenTotaal ? "bg-success/5" : "bg-danger/5"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm">
            <span className="font-medium">Lopen we voor of achter?</span>
            <span className="text-muted">
              onze kosten tot nu toe <strong className="tabular-nums text-foreground">{formatEUR(kostenTotaal)}</strong>
            </span>
            <span className="text-muted">
              ontvangen <strong className="tabular-nums text-foreground">{formatEUR(ontvangenEx)}</strong>
            </span>
            <span className={`font-semibold tabular-nums ${ontvangenEx >= kostenTotaal ? "text-success" : "text-danger"}`}>
              {ontvangenEx >= kostenTotaal
                ? `+ ${formatEUR(ontvangenEx - kostenTotaal)} vooruit`
                : `− ${formatEUR(kostenTotaal - ontvangenEx)} voorgeschoten`}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {ontvangenEx >= kostenTotaal
              ? "Er is meer binnen dan er tot nu toe is uitgegeven — precies waarvoor je met voorschotten werkt."
              : `Er is meer uitgegeven dan er binnen is: dit deel financier je zelf. Hieronder staat ${formatEUR(
                  tekortAfgerond,
                )} al ingevuld.`}{" "}
            Alle bedragen ex. btw.
          </p>
          {aanneemsom > 0 && doorTeBelasten > aanneemsom && (
            <p className="mt-2 text-xs text-warning">
              Let op: wat er doorbelast moet worden ({formatEUR(doorTeBelasten)}) ligt boven de aanneemsom van{" "}
              {formatEUR(aanneemsom)}. Dat verschil is geen voorschotkwestie maar{" "}
              <Link href="#meerwerk" className="underline underline-offset-2">
                meerwerk
              </Link>{" "}
              — leg het vast en laat de klant akkoord geven.
            </p>
          )}
        </div>

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
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted">Eerder opgevraagd</p>
            {eerder.map((m) => {
              const gevraagd = m.amountEur != null ? Number(m.amountEur) : null;
              const binnen = ontvangenPerVerzoek.get(m.id) ?? 0;
              const open = gevraagd != null ? Math.round((gevraagd - binnen) * 100) / 100 : null;
              const pct = gevraagd && gevraagd > 0 ? Math.min(100, Math.round((binnen / gevraagd) * 100)) : 0;
              const voldaan = open != null && open <= 0.01;
              return (
                <div key={m.id} className="rounded-md border bg-background/50 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-base font-semibold tabular-nums">
                      {gevraagd != null ? formatEUR(gevraagd) : "bedrag onbekend"}
                    </span>
                    <span className="text-sm">{termijnUit(m.subject)}</span>
                    <span className="text-xs text-muted">
                      {m.createdAt.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                      {m.toEmail}
                    </span>
                  </div>

                  {gevraagd != null && (
                    <div className="mt-2">
                      {/* Balkje: in één oogopslag zien hoever een voorschot binnen is. */}
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                        <div
                          className={voldaan ? "h-full bg-success" : "h-full bg-warning"}
                          style={{ width: `${Math.max(pct, binnen > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs">
                        {binnen === 0 ? (
                          <span className="text-muted">nog niets ontvangen</span>
                        ) : voldaan ? (
                          <span className="text-success">volledig ontvangen</span>
                        ) : (
                          <span className="text-warning">
                            {formatEUR(binnen)} ontvangen · nog {formatEUR(open ?? 0)} open
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {binnen > 0 && !voldaan && (
                      <>
                        <LinkButton
                          href={`?vstand=${m.id}#voorschot-opvragen`}
                          variant="secondary"
                          size="sm"
                          scroll={false}
                        >
                          Ontvangst bevestigen
                        </LinkButton>
                        <LinkButton
                          href={`?vrestant=${m.id}#voorschot-opvragen`}
                          variant="secondary"
                          size="sm"
                          scroll={false}
                        >
                          Restant opvragen
                        </LinkButton>
                      </>
                    )}
                    {voldaan && (
                      <LinkButton
                        href={`/documents/new?kind=fondos&projectId=${projectId}${contactId ? `&contactId=${contactId}` : ""}`}
                        variant="primary"
                        size="sm"
                      >
                        + Provisión de fondos
                      </LinkButton>
                    )}
                    <LinkButton href={`/sent-mail/${m.id}`} variant="ghost" size="sm">
                      Brief bekijken
                    </LinkButton>
                    <LinkButton
                      href={`/sent-mail/${m.id}/print?auto=1`}
                      variant="ghost"
                      size="sm"
                      target="_blank"
                    >
                      Printen
                    </LinkButton>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted">
              Deel ontvangen? Boek dat bedrag bij Ontvangen betalingen en kies daar dit verzoek — dan loopt de stand
              hierboven mee. Het formele stuk (provisión de fondos) maak je pas als alles binnen is.
            </p>
          </div>
        )}

        {standConcept && (
          <form action={sendAdvanceRequest.bind(null, projectId)} className="space-y-3 rounded-md border border-success/40 bg-success/5 p-3">
            <p className="text-sm">
              <strong>Ontvangst bevestigen</strong> — bedankt voor {formatEUR(standBinnen)} en meldt dat er nog{" "}
              {formatEUR(Math.round((standGevraagd - standBinnen) * 100) / 100)} openstaat. Vraagt er niet om.
            </p>
            <input type="hidden" name="amountEur" value={String(Math.round((standGevraagd - standBinnen) * 100) / 100)} />
            <input type="hidden" name="termLabel" value={termijnUit(standVerzoek?.subject ?? null)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Aan" htmlFor="stand-to">
                <Input id="stand-to" name="to" type="email" defaultValue={standVerzoek?.toEmail ?? to ?? ""} required />
              </Field>
              <Field label="Onderwerp" htmlFor="stand-subject">
                <Input id="stand-subject" name="subject" defaultValue={standConcept.subject} required />
              </Field>
            </div>
            <Field label="Bericht" htmlFor="stand-text" hint="dit gaat er letterlijk uit — Nederlands en Spaans">
              <Textarea id="stand-text" name="text" rows={18} defaultValue={standConcept.text} className="font-mono text-xs" />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton variant="primary" pendingLabel="Versturen…">
                Versturen naar de klant
              </SubmitButton>
              <Link href="#voorschot-opvragen" className="text-sm text-muted hover:underline">
                Annuleren
              </Link>
            </div>
          </form>
        )}

        {restantConcept && (
          <form action={sendAdvanceRequest.bind(null, projectId)} className="space-y-3 rounded-md border border-accent/40 bg-accent/5 p-3">
            <p className="text-sm">
              <strong>Restant opvragen</strong> — vraagt om de resterende{" "}
              {formatEUR(Math.round((restantGevraagd - restantBinnen) * 100) / 100)}, mét de bankgegevens erbij.
            </p>
            <input type="hidden" name="amountEur" value={String(Math.round((restantGevraagd - restantBinnen) * 100) / 100)} />
            <input type="hidden" name="termLabel" value={termijnUit(restantVerzoek?.subject ?? null)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Aan" htmlFor="rest-to">
                <Input id="rest-to" name="to" type="email" defaultValue={restantVerzoek?.toEmail ?? to ?? ""} required />
              </Field>
              <Field label="Onderwerp" htmlFor="rest-subject">
                <Input id="rest-subject" name="subject" defaultValue={restantConcept.subject} required />
              </Field>
            </div>
            <Field label="Bericht" htmlFor="rest-text" hint="dit gaat er letterlijk uit — Nederlands en Spaans">
              <Textarea id="rest-text" name="text" rows={20} defaultValue={restantConcept.text} className="font-mono text-xs" />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton variant="primary" pendingLabel="Versturen…">
                Versturen naar de klant
              </SubmitButton>
              <Link href="#voorschot-opvragen" className="text-sm text-muted hover:underline">
                Annuleren
              </Link>
            </div>
          </form>
        )}

        {/* Stap 1 — wat vragen we op? GET, zodat er niets stiekem wordt bewaard. */}
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-end">
          <Field label="Termijn" hint="komt letterlijk in de brief">
            <Input name="vtermijn" defaultValue={termLabel} placeholder="1e & 2e termijn" required />
          </Field>
          <Field label="Bedrag (€)">
            <Input
              name="vbedrag"
              inputMode="decimal"
              defaultValue={params.vbedrag ?? (tekortAfgerond > 0 ? String(tekortAfgerond) : "")}
              placeholder="50.000,00"
              required
            />
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
