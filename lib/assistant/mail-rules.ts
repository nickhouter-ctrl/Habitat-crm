export const MAIL_GROUPS = {
  urgent: "Urgent", important: "Belangrijk", low: "Lage prioriteit",
  newsletter: "Nieuwsbrieven", receipt: "Facturen en bonnen", spam: "Mogelijk ongewenst",
} as const;
export type MailGroup = keyof typeof MAIL_GROUPS;
export type MailInput = { id: string; subject: string | null; bodyText: string | null; fromEmail: string | null; receivedAt: Date | null };
export type MailSuggestion = { category: MailGroup; needsReply: boolean; summary: string; reason: string; deadline: string | null; draft: string | null; source: "rules" | "ai" };
export function suggestMail(mail: MailInput): MailSuggestion {
  const text = `${mail.subject ?? ""}\n${mail.bodyText ?? ""}`;
  let category: MailGroup = "important";
  let reason = "Controleer inhoud en gewenste vervolgstap.";
  if (/\b(unsubscribe|afmelden|newsletter|nieuwsbrief|boletín)\b/i.test(text)) {
    category = "newsletter"; reason = "Lijkt op een nieuwsbrief. Archiveren of afmelden is uitsluitend een voorstel.";
  }
  if (/\b(factuur|facturen|invoice|factura|receipt|betalingsbewijs)\b/i.test(text)) {
    category = "receipt"; reason = "Mogelijk financieel document; controleer de bestaande lijst Facturen keuren.";
  }
  if (/\b(urgent|dringend|spoed|vandaag|today|vencido|overdue)\b/i.test(text)) {
    category = "urgent"; reason = "Bevat een mogelijk tijdgevoelig signaal; controleer de datum in het oorspronkelijke bericht.";
  }
  return { category, reason, needsReply: !["newsletter", "receipt"].includes(category),
    summary: (mail.subject || "Bericht zonder onderwerp").slice(0, 300), deadline: null, draft: null, source: "rules" };
}

/** Conservative CRM-only archive gate. AI classifications never authorize it. */
export function canAutoArchive(mail: MailInput & { attachments?: unknown; linkedPurchaseOrderId?: string | null; linkedQuoteRequestId?: string | null }, knownContact: boolean): boolean {
  if (knownContact || mail.linkedPurchaseOrderId || mail.linkedQuoteRequestId) return false;
  if (mail.attachments != null && (!Array.isArray(mail.attachments) || mail.attachments.length > 0)) return false;
  const text = `${mail.subject ?? ""}\n${mail.bodyText ?? ""}`;
  // Commercial requests and transaction messages always require a person.
  if (/\b(factuur|facturen|invoice|factura|receipt|betaling|payment|pago|order|bestelling|pedido|offerte|aanvraag|inquiry|enquiry|quotation|presupuesto|project|proyecto|levering|delivery|entrega|appointment|afspraak|cita|klacht|complaint|urgent|spoed|interesse|informatie|information|inquiry|consultation|renovatie|renovation|badkamer|bathroom|kitchen|keuken|solicitud|consulta)\b|\?/i.test(text)) return false;
  const sender = mail.fromEmail?.split("@")[0] ?? "";
  const automatedMarketingSender = /^(newsletter|newsletters|marketing|promotions|offers|deals|boletin)([._+-]|$)/i.test(sender);
  const unsubscribe = /\b(unsubscribe|afmelden|uitschrijven|darse de baja|cancelar suscripción)\b/i.test(text);
  const promotional = /\b(sale|discount|korting|aanbiedingen|descuento|rebajas|promotion|promoción|nieuwsbrief|newsletter)\b/i.test(text);
  return automatedMarketingSender && unsubscribe && promotional;
}
