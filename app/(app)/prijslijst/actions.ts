"use server";

import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireWriteUser } from "@/lib/auth/guards";

import { COMPANY } from "@/lib/company";
import { db } from "@/lib/db";
import { contacts, products } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { renderPricelistPdf, type PricelistItem, type PricelistLocale } from "@/lib/pricelist-pdf";

const LOCALES: PricelistLocale[] = ["nl", "de", "en", "es"];

export async function mailPricelist(formData: FormData) {
  await requireWriteUser();

  const contactId = String(formData.get("contactId") ?? "");
  const subject = String(formData.get("subject") ?? "").trim() || "Prijslijst verkoop";
  const message = String(formData.get("message") ?? "").trim();
  const collection = String(formData.get("collection") ?? "");
  const category = String(formData.get("category") ?? "");
  const onlyActive = formData.get("onlyActive") === "on";
  const onlyWithPrice = formData.get("onlyWithPrice") === "on";
  const onlyInStock = formData.get("onlyInStock") === "on";
  const audience = String(formData.get("audience") ?? "") === "trade" ? "trade" : "particulier";
  const langParam = String(formData.get("lang") ?? "nl");
  const locale: PricelistLocale = LOCALES.includes(langParam as PricelistLocale) ? (langParam as PricelistLocale) : "nl";

  if (!contactId) {
    redirect(`/prijslijst?error=${encodeURIComponent("Kies een klant.")}`);
  }
  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, contactId) });
  if (!contact?.email) {
    redirect(`/prijslijst?error=${encodeURIComponent("Klant heeft geen e-mailadres.")}`);
  }

  const filters = [
    collection ? eq(products.collection, collection) : undefined,
    category ? eq(products.category, category) : undefined,
    onlyActive ? eq(products.isActive, true) : undefined,
    onlyWithPrice ? isNotNull(products.priceEur) : undefined,
    onlyInStock
      ? sql`coalesce(${products.stockQty}, 0) > 0 and ${products.availability} <> 'order_only'`
      : undefined,
  ].filter(Boolean) as never[];

  const rows = await db
    .select()
    .from(products)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(products.collection), asc(products.category), asc(products.name));

  const groupBy = collection ? "category" : "collection";
  const items: PricelistItem[] = rows.map((p) => ({
    name: p.name,
    sku: p.sku ?? null,
    description: p.description ?? null,
    descriptionI18n: (p.descriptionI18n as Partial<Record<PricelistLocale, string>> | null) ?? null,
    imageUrl: p.imageUrl ?? null,
    widthMm: p.widthMm ?? null,
    heightMm: p.heightMm ?? null,
    lengthMm: p.lengthMm ?? null,
    thicknessMm: p.thicknessMm ?? null,
    additionalSizes: (p.additionalSizes as Array<{ sku: string; label: string }> | null) ?? null,
    unit: p.unit ?? null,
    priceEur: audience === "trade" ? (p.tradePriceEur ?? p.priceEur ?? null) : (p.priceEur ?? null),
    vatRate: p.vatRate ?? 21,
    group: ((groupBy === "category" ? p.category : p.collection) ?? "Overige").trim(),
  }));

  const subtitleParts: string[] = [];
  if (audience === "trade") subtitleParts.push("Aannemers / architecten");
  if (collection) subtitleParts.push(`Collectie: ${collection}`);
  if (category) subtitleParts.push(`Categorie: ${category}`);
  const subtitle = subtitleParts.length ? subtitleParts.join(" · ") : null;

  const pdf = await renderPricelistPdf({ items, subtitle, locale });
  const filename = `habitat-one-prijslijst-${audience === "trade" ? "trade-" : ""}${locale}-${collection || "alles"}.pdf`.replace(/[^a-z0-9.-]/gi, "-").toLowerCase();

  const html = `
    <p>Beste ${contact.name ?? ""},</p>
    ${message ? `<p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>` : ""}
    <p>In de bijlage vind je onze actuele prijslijst${subtitle ? ` (${escapeHtml(subtitle)})` : ""}.</p>
    <p>Met vriendelijke groet,<br/>${COMPANY.name}</p>
  `;
  const result = await sendEmail({
    to: contact.email,
    subject,
    html,
    text: `${message ? message + "\n\n" : ""}In de bijlage vind je onze prijslijst.\n\n${COMPANY.name}`,
    attachments: [{ filename, content: pdf, contentType: "application/pdf" }],
  });

  if (!result.sent) {
    redirect(
      `/prijslijst?error=${encodeURIComponent(`Versturen mislukt: ${result.reason ?? "onbekend"}`)}`,
    );
  }
  redirect("/prijslijst?sent=1");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
