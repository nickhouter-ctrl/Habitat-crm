import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { asStringArray } from "@/lib/documents";

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
import { quoteRequests } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";
import {
  acceptQuoteRequest,
  deleteQuoteRequest,
  mailQuoteRequestCustomer,
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
  const { id } = await params;
  const sp = await searchParams;
  const req = await db.query.quoteRequests.findFirst({ where: eq(quoteRequests.id, id) });
  if (!req) notFound();

  const meta = STATUS_META[req.status] ?? STATUS_META.pending;
  const kindMeta = KIND_META[req.kind] ?? KIND_META.quote;
  const isAppointment = req.kind === "appointment";
  const products = asStringArray(req.productNames);
  const skus = asStringArray(req.productSkus);

  const accept = acceptQuoteRequest.bind(null, id);
  const reject = rejectQuoteRequest.bind(null, id);
  const reopen = reopenQuoteRequest.bind(null, id);
  const remove = deleteQuoteRequest.bind(null, id);
  const saveNotes = saveQuoteRequestNotes.bind(null, id);
  const schedule = scheduleAppointment.bind(null, id);
  const mailCustomer = mailQuoteRequestCustomer.bind(null, id);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {kindMeta.emoji} {req.name}
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </span>
        }
        subtitle={`${kindMeta.label} · ontvangen ${formatDate(req.createdAt)}${req.locale ? ` · taal: ${req.locale}` : ""}`}
        actions={
          <LinkButton href="/aanvragen" variant="ghost">
            ← Overzicht
          </LinkButton>
        }
      />

      <div className="grid max-w-5xl gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Klantgegevens</CardTitle>
              {req.contactId && (
                <Link href={`/contacts/${req.contactId}`} className="text-xs text-accent hover:underline">
                  Bekijk contact →
                </Link>
              )}
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row label="Naam" value={req.name} />
              <Row label="E-mail" value={<a href={`mailto:${req.email}`} className="text-accent hover:underline">{req.email}</a>} />
              {req.phone && <Row label="Telefoon" value={<a href={`tel:${req.phone}`} className="text-accent hover:underline">{req.phone}</a>} />}
              {req.company && <Row label="Bedrijf" value={req.company} />}
            </CardContent>
          </Card>

          {req.message && (
            <Card>
              <CardHeader>
                <CardTitle>Bericht</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm leading-relaxed">{req.message}</p>
              </CardContent>
            </Card>
          )}

          {products.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Producten in aanvraag</CardTitle>
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
              <CardTitle>Interne notitie</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveNotes} className="space-y-2">
                <Textarea name="notes" rows={3} defaultValue={req.notes ?? ""} placeholder="Notitie alleen zichtbaar voor jullie team…" />
                <SubmitButton size="sm" variant="secondary" pendingLabel="Opslaan…">Notitie opslaan</SubmitButton>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Acties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {req.status === "pending" && (
                <>
                  <form action={accept}>
                    <SubmitButton variant="primary" className="w-full" pendingLabel="Accepteren…">
                      ✓ Accepteren
                    </SubmitButton>
                  </form>
                  <p className="text-xs text-muted">
                    Bij accepteren wordt automatisch een contact aangemaakt (als nog niet bekend). Mailen naar klant komt in een latere release.
                  </p>
                  <form action={reject}>
                    <SubmitButton variant="ghost" className="w-full text-danger hover:bg-danger/10" pendingLabel="Afwijzen…">
                      Afwijzen
                    </SubmitButton>
                  </form>
                </>
              )}
              {req.status !== "pending" && (
                <>
                  <div className="text-sm">
                    {req.status === "accepted" && req.acceptedAt && (
                      <p>✓ Geaccepteerd op {formatDate(req.acceptedAt)}</p>
                    )}
                    {req.status === "rejected" && req.rejectedAt && (
                      <p>Afgewezen op {formatDate(req.rejectedAt)}</p>
                    )}
                  </div>
                  <form action={reopen}>
                    <SubmitButton size="sm" variant="ghost" className="w-full" pendingLabel="Heropenen…">
                      Heropenen
                    </SubmitButton>
                  </form>
                </>
              )}
              <form action={remove}>
                <ConfirmSubmit
                  message="Deze aanvraag definitief verwijderen?"
                  className="w-full rounded-md px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
                >
                  Aanvraag verwijderen
                </ConfirmSubmit>
              </form>
            </CardContent>
          </Card>

          {isAppointment && (
            <Card>
              <CardHeader>
                <CardTitle>📅 Afspraak inplannen</CardTitle>
              </CardHeader>
              <CardContent>
                {(req.appointmentDate || req.appointmentTime) && (
                  <p className="mb-2 rounded-md bg-accent/10 px-3 py-2 text-xs text-accent">
                    Voorkeur van de klant: <strong>{[req.appointmentDate, req.appointmentTime].filter(Boolean).join(" · ")}</strong> — al ingevuld hieronder.
                  </p>
                )}
                <form action={schedule} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Datum" htmlFor="date">
                      <Input type="date" name="date" required defaultValue={req.appointmentDate ?? ""} />
                    </Field>
                    <Field label="Tijd" htmlFor="time">
                      <Input type="time" name="time" required defaultValue={req.appointmentTime ?? ""} />
                    </Field>
                  </div>
                  <Field label="Locatie" htmlFor="location">
                    <Input name="location" defaultValue="Showroom — Camí de la Fontana 3, Jávea" />
                  </Field>
                  <Textarea name="note" rows={2} placeholder="Opmerking voor de klant (optioneel)…" />
                  <SubmitButton variant="primary" className="w-full" pendingLabel="Inplannen…">
                    Inplannen + klant bevestigen
                  </SubmitButton>
                </form>
                <p className="mt-2 text-xs text-muted">
                  De klant krijgt direct een bevestigingsmail; de afspraak verschijnt in de agenda.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Mail de klant</CardTitle>
            </CardHeader>
            <CardContent>
              {sp.gemaild === "1" && (
                <p className="mb-2 rounded-md bg-success/10 px-3 py-2 text-xs text-success">
                  ✓ Mail verstuurd naar de klant.
                </p>
              )}
              {sp.gemaild === "0" && (
                <p className="mb-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                  Mail kon niet verstuurd worden.
                </p>
              )}
              <form action={mailCustomer} className="space-y-2">
                <Input name="subject" defaultValue="Je aanvraag bij Habitat One" />
                <Textarea
                  name="message"
                  rows={4}
                  required
                  placeholder="Bijv. een extra vraag aan de klant…"
                />
                <SubmitButton variant="secondary" className="w-full" pendingLabel="Versturen…">
                  Versturen naar {req.email}
                </SubmitButton>
              </form>
            </CardContent>
          </Card>

          {req.status === "accepted" && req.contactId && (
            <Card>
              <CardHeader>
                <CardTitle>Volgende stap</CardTitle>
              </CardHeader>
              <CardContent>
                <LinkButton
                  href={`/documents/new?kind=estimate&contactId=${req.contactId}&fromAanvraag=${req.id}`}
                  variant="primary"
                  className="w-full"
                >
                  + Offerte opstellen
                </LinkButton>
                <p className="mt-2 text-xs text-muted">
                  Opent de wizard met dit contact én de aangevraagde producten alvast ingevuld.
                </p>
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
