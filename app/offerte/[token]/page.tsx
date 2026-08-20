import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { lineNet } from "@/lib/documents";
import { formatDate, formatEUR } from "@/lib/utils";
import { acceptOfferte, rejectOfferte } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offerte · Habitat One" };

type Lang = "en" | "nl" | "es" | "de";
const T: Record<Lang, Record<string, string>> = {
  nl: {
    quote: "Offerte",
    invoice: "Factuur",
    date: "Datum",
    valid: "Geldig t/m",
    for: "Voor",
    description: "Omschrijving",
    qty: "Aantal",
    price: "Prijs",
    vat: "BTW",
    net: "Netto",
    subtotal: "Subtotaal",
    total: "Totaal",
    accept: "Accepteren",
    reject: "Afwijzen",
    rejectReasonPh: "Reden (optioneel)",
    accepted: "Bedankt! U heeft deze offerte geaccepteerd op",
    rejected: "U heeft deze offerte afgewezen.",
    unavailable: "Deze offerte is niet meer beschikbaar.",
    confirm: "Bekijk de offerte en geef akkoord:",
    toContract: "Doorgaan naar ondertekenen",
    contractNote: "Voor een volledige verbouwing tekent u een aannemingsovereenkomst met de voorbehouden over meerwerk en onvoorziene kosten.",
    signed: "U heeft de overeenkomst ondertekend op",
    expired: "Deze link is verlopen. Neem contact met ons op voor een actuele offerte.",
  },
  en: {
    quote: "Quote",
    invoice: "Invoice",
    date: "Date",
    valid: "Valid until",
    for: "For",
    description: "Description",
    qty: "Qty",
    price: "Price",
    vat: "VAT",
    net: "Net",
    subtotal: "Subtotal",
    total: "Total",
    accept: "Accept",
    reject: "Decline",
    rejectReasonPh: "Reason (optional)",
    accepted: "Thank you! You accepted this quote on",
    rejected: "You declined this quote.",
    unavailable: "This quote is no longer available.",
    confirm: "Review the quote and approve it:",
    toContract: "Continue to signing",
    contractNote: "For a full renovation you sign a construction contract covering the reservations on additional work and unforeseen costs.",
    signed: "You signed the contract on",
    expired: "This link has expired. Please contact us for an up-to-date quote.",
  },
  es: {
    quote: "Presupuesto",
    invoice: "Factura",
    date: "Fecha",
    valid: "Válido hasta",
    for: "Para",
    description: "Descripción",
    qty: "Cant.",
    price: "Precio",
    vat: "IVA",
    net: "Neto",
    subtotal: "Subtotal",
    total: "Total",
    accept: "Aceptar",
    reject: "Rechazar",
    rejectReasonPh: "Motivo (opcional)",
    accepted: "¡Gracias! Ha aceptado este presupuesto el",
    rejected: "Ha rechazado este presupuesto.",
    unavailable: "Este presupuesto ya no está disponible.",
    confirm: "Revise el presupuesto y apruébelo:",
    toContract: "Continuar a la firma",
    contractNote: "Para una reforma completa se firma un contrato de obra que recoge las reservas sobre trabajos adicionales y costes imprevistos.",
    signed: "Ha firmado el contrato el",
    expired: "Este enlace ha caducado. Póngase en contacto con nosotros para un presupuesto actualizado.",
  },
  de: {
    quote: "Angebot",
    invoice: "Rechnung",
    date: "Datum",
    valid: "Gültig bis",
    for: "Für",
    description: "Beschreibung",
    qty: "Menge",
    price: "Preis",
    vat: "MwSt.",
    net: "Netto",
    subtotal: "Zwischensumme",
    total: "Gesamt",
    accept: "Annehmen",
    reject: "Ablehnen",
    rejectReasonPh: "Grund (optional)",
    accepted: "Danke! Sie haben dieses Angebot angenommen am",
    rejected: "Sie haben dieses Angebot abgelehnt.",
    unavailable: "Dieses Angebot ist nicht mehr verfügbar.",
    confirm: "Prüfen Sie das Angebot und genehmigen Sie es:",
    toContract: "Weiter zur Unterzeichnung",
    contractNote: "Für eine komplette Renovierung unterzeichnen Sie einen Bauvertrag mit den Vorbehalten zu Zusatzarbeiten und unvorhergesehenen Kosten.",
    signed: "Sie haben den Vertrag unterzeichnet am",
    expired: "Dieser Link ist abgelaufen. Bitte kontaktieren Sie uns für ein aktuelles Angebot.",
  },
};

export default async function PublicOffertePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const doc = await db.query.documents.findFirst({
    where: eq(documents.acceptToken, token),
    // Verlopen bepalen in SQL: een klokaflezing in een component is geen zuivere
    // functie (React kan opnieuw renderen), en de database heeft de klok toch al.
    extras: {
      verlopen: sql<boolean>`coalesce(${documents.acceptTokenExpiresAt} < now(), false)`.as("verlopen"),
    },
    with: { contact: { columns: { name: true, preferredLanguage: true } } },
  });
  if (!doc) notFound();

  const lang: Lang = (["en", "nl", "es", "de"] as const).includes(
    doc.contact?.preferredLanguage as Lang,
  )
    ? (doc.contact!.preferredLanguage as Lang)
    : "es";
  const t = T[lang];
  const items = doc.items ?? [];
  const isFondos = doc.kind === "fondos";
  const kindLabel =
    doc.kind === "invoice"
      ? t.invoice
      : doc.kind === "deliverynote"
        ? "Pakbon"
        : isFondos
          ? "Provisión de fondos"
          : t.quote;
  const isClosed = doc.status === "void";
  const verlopen = doc.verlopen;
  const accept = acceptOfferte.bind(null, token);
  const reject = rejectOfferte.bind(null, token);
  const pdfHref = `/offerte/${token}/pdf`;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <div className="mb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/habitat-one-logo.png" alt="Habitat One" className="h-10 w-auto" />
        <p className="mt-1.5 text-xs text-muted">Xàbia · Costa Blanca</p>
      </div>

      <div className="rounded-xl border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
          <div>
            <h1 className="text-lg font-semibold">
              {kindLabel} {doc.docNumber ?? ""}
            </h1>
            {doc.title && <p className="text-sm text-muted">{doc.title}</p>}
          </div>
          <div className="text-right text-sm text-muted">
            <div>
              {t.date}: {formatDate(doc.issueDate)}
            </div>
            {doc.dueDate && (
              <div>
                {t.valid}: {formatDate(doc.dueDate)}
              </div>
            )}
            {doc.contact?.name && (
              <div className="mt-1 text-foreground">
                {t.for}: {doc.contact.name}
              </div>
            )}
            <a href={pdfHref} className="mt-1 inline-block text-accent hover:underline">
              ↓ PDF
            </a>
          </div>
        </div>

        <div className="overflow-x-auto pt-4">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2">{t.description}</th>
                <th className="py-2 pr-6 text-right">{t.qty}</th>
                <th className="py-2 text-right">{t.price}</th>
                {!isFondos && <th className="py-2 text-right">{t.vat}%</th>}
                <th className="py-2 text-right">{t.net}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((it, i) => (
                <tr key={i} className="align-top">
                  <td className="py-2.5 pr-2">
                    <span className="font-medium">{it.name}</span>
                    {it.description && (
                      <span className="block text-xs text-muted">{it.description}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-6 text-right tabular-nums">{it.units}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatEUR(it.price)}</td>
                  {!isFondos && <td className="py-2.5 text-right tabular-nums">{it.taxRate ?? 0}%</td>}
                  <td className="py-2.5 text-right tabular-nums">{formatEUR(lineNet(it))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 ml-auto w-full max-w-xs space-y-1 border-t pt-3 text-sm">
          {!isFondos && (
            <div className="flex justify-between">
              <span className="text-muted">{t.subtotal}</span>
              <span className="tabular-nums">{formatEUR(doc.subtotalEur)}</span>
            </div>
          )}
          {!isFondos && (
            <div className="flex justify-between">
              <span className="text-muted">{t.vat}</span>
              <span className="tabular-nums">{formatEUR(doc.taxEur)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-1 text-base font-semibold">
            <span>{t.total}</span>
            <span className="tabular-nums">{formatEUR(doc.totalEur)}</span>
          </div>
        </div>

        {doc.notes && (
          <p className="mt-4 whitespace-pre-wrap border-t pt-3 text-sm text-muted">{doc.notes}</p>
        )}
      </div>

      {/* Action area */}
      <div className="mt-6" id="akkoord">
        {doc.signature ? (
          <p className="rounded-xl border bg-green-50 px-5 py-4 text-sm text-success">
            ✍️ {t.signed} {formatDate(doc.signature.signedAt)} —{" "}
            <Link href={`/offerte/${token}/contract`} className="underline">
              {doc.signature.name}
            </Link>
          </p>
        ) : doc.acceptedAt ? (
          <p className="rounded-xl border bg-green-50 px-5 py-4 text-sm text-success">
            ✓ {t.accepted} {formatDate(doc.acceptedAt)}.
          </p>
        ) : verlopen ? (
          <p className="rounded-xl border bg-background px-5 py-4 text-sm text-muted">{t.expired}</p>
        ) : doc.rejectedAt ? (
          <p className="rounded-xl border bg-red-50 px-5 py-4 text-sm text-danger">
            {t.rejected}
          </p>
        ) : isClosed ? (
          <p className="rounded-xl border bg-background px-5 py-4 text-sm text-muted">
            {t.unavailable}
          </p>
        ) : doc.kind !== "estimate" ? null : (
          <div className="rounded-xl border bg-surface p-5 shadow-sm">
            <p className="mb-3 text-sm text-muted">
              {doc.requiresContract ? t.contractNote : t.confirm}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {doc.requiresContract ? (
                // Een volledige verbouwing wordt ondertekend, niet weggeklikt.
                // De guard zit óók in acceptOfferte — deze knop verbergen is niet
                // genoeg, de server action is publiek aanroepbaar.
                <Link
                  href={`/offerte/${token}/contract`}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
                >
                  ✍️ {t.toContract}
                </Link>
              ) : (
                <form action={accept}>
                  <button
                    type="submit"
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
                  >
                    ✓ {t.accept}
                  </button>
                </form>
              )}
              <form action={reject} className="flex flex-wrap items-center gap-2">
                <input
                  name="reason"
                  placeholder={t.rejectReasonPh}
                  className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
                <button
                  type="submit"
                  className="rounded-md border bg-surface px-4 py-2 text-sm hover:bg-background"
                >
                  {t.reject}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
