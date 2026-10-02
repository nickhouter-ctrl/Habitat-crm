import { datumTaal } from "@/lib/i18n/server";
import { tekst as uiTranslation } from '@/lib/i18n/server';
import { desc, eq, ilike } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { AiMailForm } from "@/components/ai-mail-form";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { aiReplyConfigured } from "@/lib/ai-reply";
import { isBeursAanvraag, standaardLocatie } from "@/lib/appointments";
import { asStringArray } from "@/lib/documents";
import { aanvraagStilSinds } from "@/lib/opvolging";
import { listCatalogFiles } from "@/lib/storage";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  LinkButton,
  PageHeader,
  Textarea,
} from "@/components/ui";
import { db } from "@/lib/db";
import { isBeursRegistratie } from "@/lib/aanvraag-selectie";
import { requireModuleRead } from "@/lib/auth/guards";
import { emailInbox, quoteRequests, sentEmails } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";
import {
  acceptQuoteRequest,
  aiAanvraagConcept,
  deleteQuoteRequest,
  mailQuoteRequestCustomer,
  proposeSlots,
  rejectQuoteRequest,
  reopenQuoteRequest,
  saveQuoteRequestNotes,
  scheduleAppointment,
} from "../actions";

const KIND_META: Record<string, { label: string; emoji: string }> = {
  quote: { label: "Offerte-aanvraag", emoji: "📝" },
  appointment: { label: "Afspraak / showroombezoek", emoji: "📅" },
  contact: { label: "Contactbericht", emoji: "✉️" },
};

const STATUS_META: Record<string, { label: string; tone: "info" | "success" | "warning" | "danger" | "neutral" }> = {
  pending: { label: "Open", tone: "info" },
  accepted: { label: "Geaccepteerd", tone: "success" },
  rejected: { label: "Afgewezen", tone: "neutral" },
};

export default async function QuoteRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const uiDateLocale = await datumTaal();
  const uiT = await uiTranslation();
  await requireModuleRead('aanvragen');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const sp = await searchParams;
  const req = await db.query.quoteRequests.findFirst({ where: eq(quoteRequests.id, id) });
  if (!req) notFound();
  // Oude links blijven werken en openen nu het centrale klantdossier.
  if (isBeursRegistratie(req)) redirect(req.contactId ? `/opvolging/${req.contactId}` : '/beurs/contacten');

  const catalogi = await listCatalogFiles();
  // Opvolg-banner: klant stil sinds onze laatste mail (alleen bij open/geaccepteerd).
  const stilDagen =
    req.status === "pending" || req.status === "accepted"
      ? await aanvraagStilSinds(req.email)
      : null;

  // Conversatie: alles wat wij naar dit adres stuurden (mailarchief) + alles
  // wat er per mail van dit adres binnenkwam (inbox), op datum. Zo blijft de
  // hele uitwisseling bewaard op de plek van de aanvraag.
  const [uitgaand, binnengekomen] = await Promise.all([
    db
      .select({
        id: sentEmails.id,
        subject: sentEmails.subject,
        body: sentEmails.body,
        createdAt: sentEmails.createdAt,
      })
      .from(sentEmails)
      .where(ilike(sentEmails.toEmail, req.email))
      .orderBy(desc(sentEmails.createdAt))
      .limit(50),
    db
      .select({
        id: emailInbox.id,
        subject: emailInbox.subject,
        bodyText: emailInbox.bodyText,
        receivedAt: emailInbox.receivedAt,
      })
      .from(emailInbox)
      .where(ilike(emailInbox.fromEmail, req.email))
      .orderBy(desc(emailInbox.receivedAt))
      .limit(50),
  ]);

  const conversatie = [
    ...uitgaand.map((m) => ({
      soort: "uit" as const,
      id: m.id,
      subject: m.subject,
      tekst: m.body ?? "",
      datum: m.createdAt,
      href: null as string | null,
    })),
    ...binnengekomen.map((m) => ({
      soort: "in" as const,
      id: m.id,
      subject: m.subject,
      tekst: m.bodyText ?? "",
      datum: m.receivedAt,
      href: `/inbox/${m.id}`,
    })),
  ].sort((a, b) => (a.datum?.getTime() ?? 0) - (b.datum?.getTime() ?? 0));

  const meta = STATUS_META[req.status] ?? STATUS_META.pending;
  const kindMeta = KIND_META[req.kind] ?? KIND_META.quote;
  const isAppointment = req.kind === "appointment";
  // Beursafspraak? Dan is de locatie de stand in Valencia en niet de showroom,
  // en heeft de klant meestal alleen een DAG gekozen — de tijd stellen wij voor.
  const beurs = isBeursAanvraag(req.source);
  const products = asStringArray(req.productNames);
  const skus = asStringArray(req.productSkus);

  const accept = acceptQuoteRequest.bind(null, id);
  const reject = rejectQuoteRequest.bind(null, id);
  const reopen = reopenQuoteRequest.bind(null, id);
  const remove = deleteQuoteRequest.bind(null, id);
  const saveNotes = saveQuoteRequestNotes.bind(null, id);
  const schedule = scheduleAppointment.bind(null, id);
  const propose = proposeSlots.bind(null, id);
  const mailCustomer = mailQuoteRequestCustomer.bind(null, id);
  const aiConcept = aiAanvraagConcept.bind(null, id);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {kindMeta.emoji} {req.name}
            <Badge tone={meta.tone}>{uiT(meta.label)}</Badge>
          </span>
        }
        subtitle={uiT("{v0} · ontvangen {v1}{v2}", { v0: uiT(kindMeta.label), v1: formatDate(req.createdAt, uiDateLocale), v2: req.locale ? uiT(" · taal: {taal}",{taal:req.locale}) : "" })}
        actions={
          <LinkButton href="/aanvragen" variant="ghost">
            {uiT("← Overzicht")} </LinkButton>
        }
      />

      <div className="grid max-w-5xl gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{uiT("Klantgegevens")}</CardTitle>
              {req.contactId && (
                <Link href={`/contacts/${req.contactId}`} className="text-xs text-accent hover:underline">
                  {uiT("Bekijk contact →")} </Link>
              )}
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row label={uiT("Naam")} value={req.name} />
              <Row label={uiT("E-mail")} value={<a href={`mailto:${req.email}`} className="text-accent hover:underline">{req.email}</a>} />
              {req.phone && <Row label={uiT("Telefoon")} value={<a href={`tel:${req.phone}`} className="text-accent hover:underline">{req.phone}</a>} />}
              {req.company && <Row label={uiT("Bedrijf")} value={req.company} />}
            </CardContent>
          </Card>

          {req.message && (
            <Card>
              <CardHeader>
                <CardTitle>{uiT("Bericht")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm leading-relaxed">{req.message}</p>
              </CardContent>
            </Card>
          )}

          {conversatie.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{uiT("Conversatie")}</CardTitle>
                <span className="text-xs text-muted">{conversatie.length}</span>
              </CardHeader>
              <CardContent className="space-y-3">
                {conversatie.map((m) => (
                  <div
                    key={`${m.soort}-${m.id}`}
                    className={
                      m.soort === "uit"
                        ? "rounded-lg border border-accent/30 bg-accent/5 p-3"
                        : "rounded-lg border border-border bg-background-soft p-3"
                    }
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <Badge tone={m.soort === "uit" ? "info" : "neutral"}>
                        {m.soort === "uit" ? uiT("Wij → klant") : uiT("{v0} → ons", { v0: req.name })}
                      </Badge>
                      {m.datum && <span className="text-muted">{formatDate(m.datum, uiDateLocale)}</span>}
                      {m.subject && (
                        <span className="min-w-0 truncate font-medium" title={m.subject}>
                          {m.subject}
                        </span>
                      )}
                      {m.href && (
                        <Link href={m.href} className="ml-auto text-accent hover:underline">
                          {uiT("Open in inbox →")} </Link>
                      )}
                    </div>
                    <p className="max-h-56 overflow-y-auto whitespace-pre-line text-sm leading-relaxed">
                      {m.tekst || uiT("(geen tekst)")}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {products.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{uiT("Producten in aanvraag")}</CardTitle>
                <span className="text-xs text-muted">{products.length}</span>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {products.map((name, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-2 border-b border-border/40 py-1 last:border-0">
                    <span className="font-medium">{name}</span>
                    {skus[i] && <code className="font-mono text-xs text-muted">{skus[i]}</code>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{uiT("Interne notitie")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveNotes} className="space-y-2">
                <Textarea name="notes" rows={3} defaultValue={req.notes ?? ""} placeholder={uiT("Notitie alleen zichtbaar voor jullie team…")} />
                <SubmitButton size="sm" variant="secondary" pendingLabel={uiT("Opslaan…")}>{uiT("Notitie opslaan")}</SubmitButton>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{uiT("Acties")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {req.status === "pending" && (
                <>
                  <form action={accept}>
                    <SubmitButton variant="primary" className="w-full" pendingLabel={uiT("Accepteren…")}>
                      {uiT("✓ Accepteren")} </SubmitButton>
                  </form>
                  <p className="text-xs text-muted">
                    {uiT("Bij accepteren wordt automatisch een contact aangemaakt (als nog niet bekend). Mailen naar klant komt in een latere release.")} </p>
                  <form action={reject}>
                    <SubmitButton variant="ghost" className="w-full text-danger hover:bg-danger/10" pendingLabel={uiT("Afwijzen…")}>
                      {uiT("Afwijzen")} </SubmitButton>
                  </form>
                </>
              )}
              {req.status !== "pending" && (
                <>
                  <div className="text-sm">
                    {req.status === "accepted" && req.acceptedAt && (
                      <p>{uiT("✓ Geaccepteerd op")} {formatDate(req.acceptedAt, uiDateLocale)}</p>
                    )}
                    {req.status === "rejected" && req.rejectedAt && (
                      <p>{uiT("Afgewezen op")} {formatDate(req.rejectedAt, uiDateLocale)}</p>
                    )}
                  </div>
                  <form action={reopen}>
                    <SubmitButton size="sm" variant="ghost" className="w-full" pendingLabel={uiT("Heropenen…")}>
                      {uiT("Heropenen")} </SubmitButton>
                  </form>
                </>
              )}
              <form action={remove}>
                <ConfirmSubmit
                  message={uiT("Deze aanvraag definitief verwijderen?")}
                  className="w-full rounded-md px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
                >
                  {uiT("Aanvraag verwijderen")} </ConfirmSubmit>
              </form>
            </CardContent>
          </Card>

          {isAppointment && (
            <Card>
              <CardHeader>
                <CardTitle>{beurs ? uiT("📅 Beursafspraak inplannen") : uiT("📅 Afspraak inplannen")}</CardTitle>
              </CardHeader>
              <CardContent>
                {(req.appointmentDate || req.appointmentTime) && (
                  <p className="mb-2 rounded-md bg-accent/10 px-3 py-2 text-xs text-accent">
                    {uiT("Voorkeur van de klant:")} <strong>{[req.appointmentDate, req.appointmentTime].filter(Boolean).join(" · ")}</strong>
                    {req.appointmentDate && !req.appointmentTime
                      ? uiT(" — alleen een dag gekozen, dus vul zelf een tijd in of stel hieronder een paar tijden voor.")
                      : uiT(" — al ingevuld hieronder.")}
                  </p>
                )}
                <form action={schedule} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={uiT("Datum")} htmlFor="date">
                      <Input type="date" name="date" required defaultValue={req.appointmentDate ?? ""} />
                    </Field>
                    <Field label={uiT("Tijd")} htmlFor="time">
                      <Input type="time" name="time" required defaultValue={req.appointmentTime ?? ""} />
                    </Field>
                  </div>
                  <Field label={uiT("Locatie")} htmlFor="location">
                    <Input name="location" defaultValue={standaardLocatie(req.source)} />
                  </Field>
                  <Textarea name="note" rows={2} placeholder={uiT("Opmerking voor de klant (optioneel)…")} />
                  <SubmitButton variant="primary" className="w-full" pendingLabel={uiT("Inplannen…")}>
                    {uiT("Inplannen + klant bevestigen")} </SubmitButton>
                </form>
                <p className="mt-2 text-xs text-muted">
                  {uiT("De klant krijgt direct een bevestigingsmail; de afspraak verschijnt in de agenda.")} </p>

                <div className="mt-5 border-t pt-4">
                  <p className="text-sm font-medium">{uiT("Of: stel andere tijden voor")}</p>
                  <p className="mb-2 text-xs text-muted">
                    {beurs && req.appointmentDate
                      ? uiT("De klant koos een beursdag. Vul hieronder een paar tijden op die dag in — de datum staat al klaar — en hij kiest er zelf één via een link. Bij de keuze wordt de afspraak automatisch bevestigd en in de agenda gezet.")
                      : uiT("Komt het gevraagde moment niet uit? Geef een paar opties — de klant kiest er zelf één via een link. Bij de keuze wordt de afspraak automatisch bevestigd en in de agenda gezet.")}
                  </p>
                  {sp.proposed === "1" && (
                    <p className="mb-2 rounded-md bg-success/10 px-3 py-2 text-xs text-success">
                      {uiT("✓ Voorstel met opties verstuurd naar de klant.")} </p>
                  )}
                  {sp.error === "slots" && (
                    <p className="mb-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                      {uiT("Vul minstens één datum + tijd in.")} </p>
                  )}
                  <form action={propose} className="space-y-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="grid grid-cols-2 gap-2">
                        {/* Bij een beursdag staat de datum op élke regel klaar: dan
                            hoeven er alleen tijden ingevuld te worden. */}
                        <Input
                          type="date"
                          name={`date_${i}`}
                          defaultValue={beurs || i === 0 ? req.appointmentDate ?? "" : ""}
                        />
                        <Input type="time" name={`time_${i}`} defaultValue={i === 0 ? req.appointmentTime ?? "" : ""} />
                      </div>
                    ))}
                    <SubmitButton variant="secondary" className="w-full" pendingLabel={uiT("Versturen…")}>
                      {uiT("Voorstel sturen naar klant")} </SubmitButton>
                  </form>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{uiT("Mail de klant")}</CardTitle>
            </CardHeader>
            <CardContent>
              {sp.gemaild === "1" && (
                <p className="mb-2 rounded-md bg-success/10 px-3 py-2 text-xs text-success">
                  {uiT("✓ Mail verstuurd naar de klant.")} </p>
              )}
              {sp.gemaild === "0" && (
                <p className="mb-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                  {uiT("Mail kon niet verstuurd worden.")} </p>
              )}
              {stilDagen != null && (
                <p className="mb-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                  {uiT("⏳ De klant heeft al")} <strong>{stilDagen} {uiT("dagen")}</strong> {uiT("niet gereageerd op je laatste mail — stuur eventueel een vriendelijke herinnering.")} </p>
              )}
              <AiMailForm
                verstuur={mailCustomer}
                genereer={aiConcept}
                defaultSubject="Je aanvraag bij Habitat One"
                toEmail={req.email}
                aiBeschikbaar={aiReplyConfigured()}
                bijlagen={catalogi.map((f) => ({ path: f.path, name: f.name, size: f.size }))}
                suggestie={
                  stilDagen != null
                    ? {
                        label: uiT("✨ Schrijf herinnering"),
                        instructie: `De klant heeft ${stilDagen} dagen niet gereageerd op ons vorige bericht. Schrijf een korte, vriendelijke opvolging: verwijs naar ons eerdere bericht, vraag of het nog speelt en of we ergens mee kunnen helpen — niet pusherig.`,
                      }
                    : undefined
                }
              />
            </CardContent>
          </Card>

          {req.status === "accepted" && req.contactId && (
            <Card>
              <CardHeader>
                <CardTitle>{uiT("Volgende stap")}</CardTitle>
              </CardHeader>
              <CardContent>
                <LinkButton
                  href={`/documents/new?kind=estimate&contactId=${req.contactId}&fromAanvraag=${req.id}`}
                  variant="primary"
                  className="w-full"
                >
                  {uiT("+ Offerte opstellen")} </LinkButton>
                <p className="mt-2 text-xs text-muted">
                  {uiT("Opent de wizard met dit contact én de aangevraagde producten alvast ingevuld.")} </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
