/**
 * Email sending. Currently a stub: until an email provider is configured (e.g.
 * RESEND_API_KEY + EMAIL_FROM), `sendEmail` just logs. The accept link is always
 * returned/shown in the CRM so it can be copy-pasted in the meantime.
 */
type Lang = "en" | "nl" | "es" | "de";

export interface EmailAttachment {
  filename: string;
  /** Raw bytes — wordt voor Resend base64-encoded. */
  content: Buffer | Uint8Array;
  contentType?: string;
}

import { withMandatoryBcc } from "@/lib/mail-bcc";

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  /** Extra BCC bovenop de standaard bedrijfs-BCC. */
  bcc?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  // Elke uitgaande mail krijgt een VERBORGEN kopie (BCC) naar het bedrijf
  // (EMAIL_BCC, anders NOTIFY_EMAIL of het verzendadres hi@habitat-one.com), zodat
  // je altijd meeleest zonder dat de klant het meeziet. Niet naar de ontvanger
  // zelf bcc'en.
  const defaultBcc = process.env.EMAIL_BCC?.trim() || process.env.NOTIFY_EMAIL?.trim() || process.env.GMAIL_USER?.trim();
  const bccBase = [defaultBcc, input.bcc]
    .filter((a): a is string => !!a && a.toLowerCase() !== input.to.toLowerCase())
    .join(", ") || undefined;
  // Voeg de vaste bedrijfs-BCC (nick@) toe op ELK transport — ook Resend/stub, die
  // lib/gmail.ts overslaan. Op het Gmail-pad dedupliceert sendMail dit nog eens.
  const bcc = withMandatoryBcc(bccBase, input.to);

  // Voorkeur: Gmail (verstuurt vanaf GMAIL_USER, bv. hi@habitat-one.com). Valt
  // terug op Resend; en als niets is ingesteld een stub, zodat de accept-link
  // altijd in het CRM blijft staan.
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      const { sendMail } = await import("@/lib/gmail");
      await sendMail({
        to: input.to,
        bcc,
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments,
      });
      return { sent: true };
    } catch (err) {
      console.warn("[habitat-crm] gmail send error:", err);
      return { sent: false, reason: "gmail-exception" };
    }
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.log(
      `[habitat-crm] (email stub — not configured) → to=${input.to} subject="${input.subject}"`,
    );
    return { sent: false, reason: "not-configured" };
  }
  try {
    const payload: Record<string, unknown> = {
      from,
      to: input.to,
      ...(bcc ? { bcc } : {}),
      subject: input.subject,
      html: input.html,
      text: input.text,
    };
    if (input.attachments?.length) {
      payload.attachments = input.attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content).toString("base64"),
        ...(a.contentType ? { content_type: a.contentType } : {}),
      }));
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[habitat-crm] email send failed:", res.status, await res.text());
      return { sent: false, reason: `http-${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.warn("[habitat-crm] email send error:", err);
    return { sent: false, reason: "exception" };
  }
}

import { COMPANY } from "@/lib/company";

/**
 * Logo voor in de mailheader: altijd het echte beeldlogo van de website
 * (COMPANY.logoUrl), zodat de huisstijl in elke mail identiek is.
 */
function logoHeaderHtml(): string {
  return `<img src="${COMPANY.logoUrl}" alt="${escapeHtml(COMPANY.name)}" height="48" style="display:block;height:48px;width:auto;border:0" />`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const kindNL = (k: string) => (k === "invoice" ? "factuur" : k === "proforma" ? "pro-formafactuur" : k === "creditnote" ? "creditnota" : k === "fondos" ? "voorschotdocument (provisión de fondos)" : "offerte");
const kindEN = (k: string) => (k === "invoice" ? "invoice" : k === "proforma" ? "pro-forma invoice" : k === "creditnote" ? "credit note" : k === "fondos" ? "provisión de fondos (funds provision)" : "quote");
const kindES = (k: string) => (k === "invoice" ? "factura" : k === "proforma" ? "factura proforma" : k === "creditnote" ? "nota de crédito" : k === "fondos" ? "provisión de fondos" : "presupuesto");
const kindDE = (k: string) => (k === "invoice" ? "Rechnung" : k === "proforma" ? "Proforma-Rechnung" : k === "creditnote" ? "Gutschrift" : k === "fondos" ? "Provisión de fondos" : "Angebot");

const T: Record<
  Lang,
  {
    subject: (nr: string, kind: string) => string;
    hi: string;
    intro: (kind: string) => string;
    review: (kind: string) => string;
    accept: string;
    pdf: string;
    regards: string;
  }
> = {
  nl: {
    subject: (nr, k) => `${cap(kindNL(k))} ${nr} van ${COMPANY.name}`,
    hi: "Beste",
    intro: (k) =>
      k === "estimate"
        ? `Hierbij ontvangt u onze offerte (zie ook de PDF-bijlage). U kunt deze online bekijken en direct akkoord geven of afwijzen:`
        : `Hierbij ontvangt u onze ${kindNL(k)} (zie ook de PDF-bijlage). U kunt deze online bekijken:`,
    review: (k) => `Bekijk de ${kindNL(k)}`,
    accept: "Offerte accepteren",
    pdf: "PDF downloaden",
    regards: "Met vriendelijke groet,",
  },
  en: {
    subject: (nr, k) => `${cap(kindEN(k))} ${nr} from ${COMPANY.name}`,
    hi: "Dear",
    intro: (k) =>
      k === "estimate"
        ? `Please find our quote below (also attached as PDF). You can review it online and approve or decline it directly:`
        : `Please find our ${kindEN(k)} below (also attached as PDF). You can review it online:`,
    review: (k) => `View the ${kindEN(k)}`,
    accept: "Accept quote",
    pdf: "Download PDF",
    regards: "Kind regards,",
  },
  es: {
    subject: (nr, k) => `${cap(kindES(k))} ${nr} de ${COMPANY.name}`,
    hi: "Estimado/a",
    intro: (k) =>
      k === "estimate"
        ? `Le enviamos nuestro presupuesto (también adjunto en PDF). Puede revisarlo en línea y aprobarlo o rechazarlo directamente:`
        : `Le enviamos nuestro/a ${kindES(k)} (también adjunto en PDF). Puede revisarlo en línea:`,
    review: (k) => `Ver el/la ${kindES(k)}`,
    accept: "Aceptar presupuesto",
    pdf: "Descargar PDF",
    regards: "Un saludo,",
  },
  de: {
    subject: (nr, k) => `${cap(kindDE(k))} ${nr} von ${COMPANY.name}`,
    hi: "Sehr geehrte/r",
    intro: (k) =>
      k === "estimate"
        ? `Anbei unser Angebot (auch als PDF im Anhang). Sie können es online ansehen und direkt annehmen oder ablehnen:`
        : `Anbei unser/e ${kindDE(k)} (auch als PDF im Anhang). Sie können es online ansehen:`,
    review: (k) => `${cap(kindDE(k))} ansehen`,
    accept: "Angebot annehmen",
    pdf: "PDF herunterladen",
    regards: "Mit freundlichen Grüßen,",
  },
};

function signatureHtml(): string {
  // Zelfde meerregelige opmaak als op de PDF: straat, dan postcode + plaats,
  // daarna telefoon en e-mail onder elkaar.
  const strong = `<span style="display:block;font-weight:600;color:#555">${escapeHtml(COMPANY.legalName)}</span>`;
  const parts = [
    COMPANY.addressStreet,
    COMPANY.addressRegion,
    COMPANY.phone,
    COMPANY.email,
    COMPANY.website,
    COMPANY.vatNumber ? `NIF ${COMPANY.vatNumber}` : "",
  ].filter(Boolean);
  return strong + parts.map((p) => `<span style="display:block">${escapeHtml(p)}</span>`).join("");
}

export function offerteEmail(args: {
  lang?: string | null;
  kind?: string;
  docNumber: string;
  title?: string | null;
  contactName?: string | null;
  url: string;
  /** Aangepast onderwerp/bericht uit het verzend-previewscherm (optioneel). */
  subject?: string | null;
  message?: string | null;
}): { subject: string; html: string; text: string } {
  const lang: Lang = (["en", "nl", "es", "de"] as const).includes(args.lang as Lang)
    ? (args.lang as Lang)
    : "es";
  const t = T[lang];
  const kind = args.kind ?? "estimate";
  const isProforma = kind === "proforma";
  const nr = args.docNumber || "—";
  const subject = args.subject?.trim() || t.subject(nr, kind);
  const introText = args.message?.trim() || (isProforma ? PROFORMA_TEXT[lang].intro : t.intro(kind));
  const introHtml = introText
    .split(/\n+/)
    .map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${COMPANY.charcoal}">${escapeHtml(p)}</p>`)
    .join("");
  const greeting = args.contactName ? `${t.hi} ${escapeHtml(args.contactName)},` : `${t.hi},`;
  const title = args.title
    ? `<p style="margin:0 0 12px;font-size:14px;color:${COMPANY.muted}">${escapeHtml(args.title)}</p>`
    : "";
  const kindLabelFn = { nl: kindNL, en: kindEN, es: kindES, de: kindDE }[lang];
  const docLabel = cap(kindLabelFn(kind));
  const btn = (href: string, label: string, primary: boolean) =>
    primary
      ? `<a href="${href}" style="background:${COMPANY.terracotta};color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:8px;display:inline-block;font-weight:600;font-size:15px">${label}</a>`
      : `<a href="${href}" style="color:${COMPANY.brown};text-decoration:none;padding:12px 22px;border:1px solid ${COMPANY.sand};border-radius:8px;display:inline-block;font-weight:600;font-size:15px">${label}</a>`;
  const buttons =
    kind === "estimate"
      ? `${btn(`${args.url}?actie=accepteren`, t.accept, true)}<span style="display:inline-block;width:10px"></span>${btn(args.url, t.review(kind), false)}`
      : btn(args.url, `${t.review(kind)} (${nr})`, true);
  const html = `<div style="margin:0;padding:32px 12px;background:${COMPANY.cream};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:${COMPANY.charcoal}">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${COMPANY.sand}">
    <div style="height:4px;background:${COMPANY.terracotta}"></div>
    <table role="presentation" width="100%" style="border-collapse:collapse">
      <tr>
        <td style="padding:24px 28px 18px;vertical-align:middle">
          <img src="${COMPANY.logoUrl}" height="40" alt="${escapeHtml(COMPANY.name)}" style="display:block;height:40px;width:auto;border:0" />
        </td>
        <td style="padding:24px 28px 18px;text-align:right;vertical-align:middle">
          <div style="font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:${COMPANY.muted}">${escapeHtml(docLabel)}</div>
          <div style="font-size:17px;font-weight:700;color:${COMPANY.brown}">${escapeHtml(nr)}</div>
        </td>
      </tr>
    </table>
    <div style="height:1px;background:${COMPANY.sand};margin:0 28px"></div>
    <div style="padding:24px 28px 8px">
      <p style="margin:0 0 14px;font-size:15px;color:${COMPANY.charcoal}">${greeting}</p>
      ${introHtml}
      ${title}
      <div style="margin:24px 0 18px">${buttons}</div>
      <p style="font-size:13px;color:${COMPANY.muted};margin:0">${t.pdf}: <a href="${args.url}/pdf" style="color:${COMPANY.terracotta};font-weight:600;text-decoration:none">${escapeHtml(nr)}.pdf</a></p>
      ${isProforma ? `${bankBlockHtml(lang)}<p style="font-size:13px;color:${COMPANY.muted};margin:14px 0 4px">${escapeHtml(PROFORMA_TEXT[lang].settle)}</p>` : ""}
      <p style="margin:22px 0 4px;font-size:14px;color:${COMPANY.charcoal}">${t.regards}</p>
    </div>
    <div style="background:${COMPANY.cream};padding:18px 28px;border-top:1px solid ${COMPANY.sand};font-size:12px;line-height:1.7;color:${COMPANY.muted}">
      <span style="display:block;font-weight:700;color:${COMPANY.brown}">${escapeHtml(COMPANY.legalName)}</span>
      ${escapeHtml(COMPANY.addressStreet)}, ${escapeHtml(COMPANY.addressRegion)}<br/>
      ${escapeHtml(COMPANY.phone)} · <a href="mailto:${COMPANY.email}" style="color:${COMPANY.muted};text-decoration:none">${escapeHtml(COMPANY.email)}</a> · ${escapeHtml(COMPANY.website)}${COMPANY.vatNumber ? ` · NIF ${escapeHtml(COMPANY.vatNumber)}` : ""}
    </div>
  </div>
</div>`;
  const proformaText = isProforma ? `${bankBlockText(lang)}\n\n${PROFORMA_TEXT[lang].settle}` : "";
  const text = `${greeting}\n\n${introText}\n\n${t.review(kind)}: ${args.url}\n${t.pdf}: ${args.url}/pdf${proformaText}\n\n${t.regards}\n${COMPANY.legalName}\n${COMPANY.address}\n${[COMPANY.phone, COMPANY.email].filter(Boolean).join(" · ")}`;
  return { subject, html, text };
}

/** Standaard onderwerp + introtekst om het verzend-previewscherm voor te vullen. */
export function offerteDefaults(args: { lang?: string | null; kind?: string; docNumber: string }) {
  const lang: Lang = (["en", "nl", "es", "de"] as const).includes(args.lang as Lang)
    ? (args.lang as Lang)
    : "es";
  const t = T[lang];
  const kind = args.kind ?? "estimate";
  const nr = args.docNumber || "—";
  return { subject: t.subject(nr, kind), intro: t.intro(kind) };
}

/** Bevestigingsmail naar de klant nadat die de offerte heeft geaccepteerd. */
const TA: Record<Lang, { subject: (nr: string) => string; body: string }> = {
  nl: {
    subject: (nr) => `Bevestiging: offerte ${nr} geaccepteerd`,
    body: "Hartelijk dank! We hebben uw akkoord op de offerte ontvangen. We gaan voor u aan de slag en nemen indien nodig contact met u op over de volgende stappen.",
  },
  en: {
    subject: (nr) => `Confirmation: quote ${nr} accepted`,
    body: "Thank you! We've received your acceptance of the quote. We'll get started and will be in touch about the next steps if needed.",
  },
  es: {
    subject: (nr) => `Confirmación: presupuesto ${nr} aceptado`,
    body: "¡Gracias! Hemos recibido la aceptación de su presupuesto. Empezaremos a trabajar y, si es necesario, nos pondremos en contacto con usted sobre los siguientes pasos.",
  },
  de: {
    subject: (nr) => `Bestätigung: Angebot ${nr} angenommen`,
    body: "Vielen Dank! Wir haben Ihre Annahme des Angebots erhalten. Wir legen los und melden uns bei Bedarf bezüglich der nächsten Schritte.",
  },
};

export function offerteAcceptedEmail(args: {
  lang?: string | null;
  docNumber: string;
  contactName?: string | null;
}): { subject: string; html: string; text: string } {
  const lang: Lang = (["en", "nl", "es", "de"] as const).includes(args.lang as Lang)
    ? (args.lang as Lang)
    : "es";
  const ta = TA[lang];
  const t = T[lang];
  const nr = args.docNumber || "—";
  const greeting = args.contactName ? `${t.hi} ${escapeHtml(args.contactName)},` : `${t.hi},`;
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;background:${COMPANY.cream};padding:24px 0">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;color:#1c1c1a">
    <div style="background:${COMPANY.cream};padding:22px 28px">
      ${logoHeaderHtml()}
    </div>
    <div style="padding:24px 28px">
      <p style="margin:0">${greeting}</p>
      <p>${ta.body}</p>
      <p style="margin-top:28px">${t.regards}</p>
      <div style="font-size:13px;color:#555;margin-top:6px">${signatureHtml()}</div>
    </div>
  </div>
</div>`;
  const text = `${greeting}\n\n${ta.body}\n\n${t.regards}\n${COMPANY.legalName}`;
  return { subject: ta.subject(nr), html, text };
}

/**
 * Bevestigingsmail naar de klant nadat die via de website (habitat-one) een
 * offerte-aanvraag heeft ingediend. Taal = de op de website gekozen taal;
 * valt terug op Engels (niet Spaans) voor internationale aanvragen.
 */
const QR: Record<Lang, { subject: string; body: string; summary: string; followUp: string }> = {
  nl: {
    subject: "We hebben je offerte-aanvraag ontvangen",
    body: "Bedankt voor je aanvraag bij Habitat One. We hebben je offerte-aanvraag in goede orde ontvangen en nemen binnen één werkdag contact met je op.",
    summary: "Producten in je aanvraag",
    followUp: "Heb je in de tussentijd een vraag? Beantwoord gerust deze e-mail.",
  },
  en: {
    subject: "We've received your quote request",
    body: "Thank you for your request to Habitat One. We've received your quote request and will get back to you within one business day.",
    summary: "Products in your request",
    followUp: "Have a question in the meantime? Just reply to this email.",
  },
  es: {
    subject: "Hemos recibido su solicitud de presupuesto",
    body: "Gracias por su solicitud a Habitat One. Hemos recibido su solicitud de presupuesto y le responderemos en un día laborable.",
    summary: "Productos en su solicitud",
    followUp: "¿Tiene alguna pregunta mientras tanto? Responda a este correo.",
  },
  de: {
    subject: "Wir haben Ihre Angebotsanfrage erhalten",
    body: "Vielen Dank für Ihre Anfrage bei Habitat One. Wir haben Ihre Angebotsanfrage erhalten und melden uns innerhalb eines Werktags bei Ihnen.",
    summary: "Produkte in Ihrer Anfrage",
    followUp: "Haben Sie in der Zwischenzeit eine Frage? Antworten Sie einfach auf diese E-Mail.",
  },
};

export function quoteRequestReceivedEmail(args: {
  lang?: string | null;
  contactName?: string | null;
  productNames?: string[] | null;
  /** Optioneel met thumbnail per regel (absolute image-URL's van de website). */
  products?: { name: string; image?: string | null }[] | null;
}): { subject: string; html: string; text: string } {
  const lang: Lang = (["en", "nl", "es", "de"] as const).includes(args.lang as Lang)
    ? (args.lang as Lang)
    : "en";
  const q = QR[lang];
  const t = T[lang];
  const greeting = args.contactName ? `${t.hi} ${escapeHtml(args.contactName)},` : `${t.hi},`;
  const lines: { name: string; image: string | null }[] = args.products?.length
    ? args.products.map((p) => ({ name: p.name, image: p.image ?? null }))
    : (args.productNames ?? []).map((n) => ({ name: n, image: null }));
  const summary = lines.length
    ? `<p style="margin:24px 0 8px;font-weight:600;color:${COMPANY.brown}">${q.summary}</p>
      <table style="border-collapse:collapse;width:100%">${lines
        .map(
          (p) =>
            `<tr><td style="padding:5px 0;width:60px;vertical-align:middle">${
              p.image
                ? `<img src="${p.image}" width="52" height="52" alt="" style="display:block;width:52px;height:52px;object-fit:cover;border-radius:8px;border:1px solid ${COMPANY.sand}" />`
                : ""
            }</td><td style="padding:5px 0 5px 12px;font-size:14px;color:#1c1c1a;vertical-align:middle">${escapeHtml(p.name)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;background:${COMPANY.cream};padding:24px 0">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;color:#1c1c1a">
    <div style="background:${COMPANY.cream};padding:22px 28px">
      ${logoHeaderHtml()}
      <div style="font-size:11px;color:#999;margin-top:4px">${escapeHtml(COMPANY.tagline)}</div>
    </div>
    <div style="padding:24px 28px">
      <p style="margin:0">${greeting}</p>
      <p>${q.body}</p>
      ${summary}
      <p style="font-size:13px;color:#888;margin-top:22px">${q.followUp}</p>
      <hr style="border:none;border-top:1px solid ${COMPANY.sand};margin:24px 0 16px" />
      <p style="margin:0 0 4px">${t.regards}</p>
      <div style="font-size:13px;color:#888;line-height:1.7">${signatureHtml()}</div>
    </div>
  </div>
</div>`;
  const text =
    `${greeting}\n\n${q.body}\n\n` +
    (lines.length ? `${q.summary}:\n- ${lines.map((p) => p.name).join("\n- ")}\n\n` : "") +
    `${q.followUp}\n\n${t.regards}\n${COMPANY.legalName}\n${COMPANY.address}\n${[COMPANY.phone, COMPANY.email].filter(Boolean).join(" · ")}`;
  return { subject: q.subject, html, text };
}

/** Betaalherinnering voor een vervallen factuur. */
const PAY: Record<Lang, { subject: (nr: string) => string; intro: string; openLabel: string; dueLabel: string; ask: string }> = {
  nl: {
    subject: (nr) => `Herinnering: factuur ${nr} nog open`,
    intro: "Volgens onze administratie staat onderstaande factuur nog open. Mogelijk is uw betaling onderweg — in dat geval kunt u deze mail als niet verzonden beschouwen.",
    openLabel: "Openstaand bedrag",
    dueLabel: "Vervaldatum",
    ask: "Wilt u de betaling op korte termijn voldoen? Bij vragen of een afwijkende afspraak horen we het graag.",
  },
  en: {
    subject: (nr) => `Reminder: invoice ${nr} still open`,
    intro: "According to our records the invoice below is still outstanding. If your payment is already on its way, please disregard this message.",
    openLabel: "Amount due",
    dueLabel: "Due date",
    ask: "Could you arrange payment soon? If you have any questions or a different arrangement, just let us know.",
  },
  es: {
    subject: (nr) => `Recordatorio: factura ${nr} pendiente`,
    intro: "Según nuestros registros, la siguiente factura sigue pendiente. Si su pago ya está en camino, puede ignorar este mensaje.",
    openLabel: "Importe pendiente",
    dueLabel: "Fecha de vencimiento",
    ask: "¿Podría realizar el pago en breve? Si tiene alguna pregunta o un acuerdo distinto, díganoslo.",
  },
  de: {
    subject: (nr) => `Erinnerung: Rechnung ${nr} noch offen`,
    intro: "Nach unseren Unterlagen ist die folgende Rechnung noch offen. Sollte Ihre Zahlung bereits unterwegs sein, betrachten Sie diese Nachricht bitte als gegenstandslos.",
    openLabel: "Offener Betrag",
    dueLabel: "Fälligkeitsdatum",
    ask: "Könnten Sie die Zahlung zeitnah veranlassen? Bei Fragen oder einer abweichenden Vereinbarung melden Sie sich gern.",
  },
};

/** Toon/teksten per herinneringsniveau: 1 = vriendelijk, 2 = steviger, 3 = aanmaning. */
export type ReminderLevel = 1 | 2 | 3;
const PAY_LEVELS: Record<Lang, Record<ReminderLevel, { subject: (nr: string) => string; intro: string; ask: string }>> = {
  nl: {
    1: { subject: (nr) => `Herinnering: factuur ${nr} nog open`, intro: "Een vriendelijke herinnering: volgens onze administratie staat onderstaande factuur nog open. Mogelijk is uw betaling onderweg — in dat geval kunt u deze mail als niet verzonden beschouwen.", ask: "Wilt u de betaling op korte termijn voldoen? Bij vragen of een afwijkende afspraak horen we het graag." },
    2: { subject: (nr) => `Tweede herinnering: factuur ${nr}`, intro: "Wij hebben nog geen betaling van onderstaande factuur kunnen vaststellen, terwijl de vervaldatum inmiddels is verstreken.", ask: "Wij verzoeken u vriendelijk doch dringend het openstaande bedrag binnen 7 dagen te voldoen." },
    3: { subject: (nr) => `Aanmaning: factuur ${nr}`, intro: "Ondanks eerdere herinneringen staat onderstaande factuur nog steeds open. Dit is een laatste aanmaning.", ask: "Wij verzoeken u het openstaande bedrag binnen 14 dagen te voldoen, om verdere (incasso)stappen te voorkomen." },
  },
  en: {
    1: { subject: (nr) => `Reminder: invoice ${nr} still open`, intro: "A friendly reminder: according to our records the invoice below is still outstanding. If your payment is already on its way, please disregard this message.", ask: "Could you arrange payment soon? If you have any questions or a different arrangement, just let us know." },
    2: { subject: (nr) => `Second reminder: invoice ${nr}`, intro: "We have not yet been able to register payment of the invoice below, while the due date has now passed.", ask: "We kindly but urgently request payment of the outstanding amount within 7 days." },
    3: { subject: (nr) => `Final notice: invoice ${nr}`, intro: "Despite earlier reminders the invoice below is still unpaid. This is a final notice.", ask: "Please settle the outstanding amount within 14 days to avoid further collection steps." },
  },
  es: {
    1: { subject: (nr) => `Recordatorio: factura ${nr} pendiente`, intro: "Un recordatorio amable: según nuestros registros, la siguiente factura sigue pendiente. Si su pago ya está en camino, puede ignorar este mensaje.", ask: "¿Podría realizar el pago en breve? Si tiene alguna pregunta o un acuerdo distinto, díganoslo." },
    2: { subject: (nr) => `Segundo recordatorio: factura ${nr}`, intro: "Todavía no hemos podido registrar el pago de la siguiente factura, y la fecha de vencimiento ya ha pasado.", ask: "Le rogamos encarecidamente que abone el importe pendiente en un plazo de 7 días." },
    3: { subject: (nr) => `Requerimiento de pago: factura ${nr}`, intro: "A pesar de recordatorios anteriores, la siguiente factura sigue pendiente. Este es un último aviso.", ask: "Le solicitamos que abone el importe pendiente en un plazo de 14 días para evitar gestiones de cobro adicionales." },
  },
  de: {
    1: { subject: (nr) => `Erinnerung: Rechnung ${nr} noch offen`, intro: "Eine freundliche Erinnerung: nach unseren Unterlagen ist die folgende Rechnung noch offen. Sollte Ihre Zahlung bereits unterwegs sein, betrachten Sie diese Nachricht bitte als gegenstandslos.", ask: "Könnten Sie die Zahlung zeitnah veranlassen? Bei Fragen oder einer abweichenden Vereinbarung melden Sie sich gern." },
    2: { subject: (nr) => `Zweite Erinnerung: Rechnung ${nr}`, intro: "Wir konnten den Zahlungseingang der folgenden Rechnung noch nicht feststellen, obwohl das Fälligkeitsdatum bereits verstrichen ist.", ask: "Wir bitten Sie freundlich, aber dringend, den offenen Betrag innerhalb von 7 Tagen zu begleichen." },
    3: { subject: (nr) => `Mahnung: Rechnung ${nr}`, intro: "Trotz vorheriger Erinnerungen ist die folgende Rechnung weiterhin offen. Dies ist eine letzte Mahnung.", ask: "Wir bitten Sie, den offenen Betrag innerhalb von 14 Tagen zu begleichen, um weitere Schritte zu vermeiden." },
  },
};

/** Betaalgegevens (IBAN/BIC) — meegestuurd in herinneringen zodat de klant direct kan betalen. */
const BANK: Record<Lang, { title: string; via: string; holder: string }> = {
  nl: { title: "Betaalgegevens", via: "Gelieve te betalen via bankoverschrijving naar:", holder: "T.n.v." },
  en: { title: "Payment details", via: "Please pay by bank transfer to:", holder: "Account holder" },
  es: { title: "Datos de pago", via: "Rogamos efectuar el pago por transferencia bancaria a:", holder: "Titular" },
  de: { title: "Zahlungsinformationen", via: "Bitte überweisen Sie per Banküberweisung an:", holder: "Kontoinhaber" },
};

function bankBlockHtml(lang: Lang): string {
  if (!COMPANY.iban) return "";
  const b = BANK[lang];
  const bic = COMPANY.bic
    ? `<div style="font-size:14px;color:#555;margin-top:3px">BIC: ${escapeHtml(COMPANY.bic)}</div>`
    : "";
  return `<div style="margin:16px 0;padding:14px 18px;background:${COMPANY.cream};border-radius:10px">
        <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#999;margin-bottom:6px">${escapeHtml(b.title)}</div>
        <div style="font-size:14px;color:#555;margin-bottom:6px">${escapeHtml(b.via)}</div>
        <div style="font-size:14px;color:${COMPANY.brown};font-weight:600">IBAN: ${escapeHtml(COMPANY.iban)}</div>
        ${bic}
        <div style="font-size:13px;color:#777;margin-top:6px">${escapeHtml(b.holder)}: ${escapeHtml(COMPANY.legalName)}</div>
      </div>`;
}

function bankBlockText(lang: Lang): string {
  if (!COMPANY.iban) return "";
  const b = BANK[lang];
  const bic = COMPANY.bic ? `\nBIC: ${COMPANY.bic}` : "";
  return `\n\n${b.title}\n${b.via}\nIBAN: ${COMPANY.iban}${bic}\n${b.holder}: ${COMPANY.legalName}`;
}

/** Voorschot (pro-formafactuur): intro + verrekening-notitie per taal. */
const PROFORMA_TEXT: Record<Lang, { intro: string; settle: string }> = {
  nl: {
    intro: "Hierbij ontvangt u een voorschot (pro-formafactuur) voor de voortgang van de werkzaamheden. Wij verzoeken u vriendelijk het bedrag uit de bijgevoegde pro-formafactuur te voldoen op onderstaande rekening.",
    settle: "Dit voorschot wordt bij de uiteindelijke afrekening volledig verrekend in de definitieve factuur.",
  },
  en: {
    intro: "Please find an advance payment request (pro-forma invoice) for the progress of the works. Kindly transfer the amount stated in the attached pro-forma invoice to the account below.",
    settle: "This advance will be fully settled against the final invoice.",
  },
  es: {
    intro: "Le enviamos una solicitud de anticipo (factura proforma) para la continuación de los trabajos. Le rogamos abonar el importe indicado en la factura proforma adjunta en la cuenta indicada.",
    settle: "Este anticipo se descontará íntegramente en la factura definitiva.",
  },
  de: {
    intro: "Anbei eine Anzahlungsanforderung (Proforma-Rechnung) für den Fortschritt der Arbeiten. Bitte überweisen Sie den in der beigefügten Proforma-Rechnung genannten Betrag auf das unten genannte Konto.",
    settle: "Diese Anzahlung wird vollständig mit der Endrechnung verrechnet.",
  },
};

export function paymentReminderEmail(args: {
  lang?: string | null;
  contactName?: string | null;
  docNumber: string;
  amount: string;
  dueDate: string;
  level?: ReminderLevel;
}): { subject: string; html: string; text: string } {
  const lang = pickLang(args.lang);
  const p = PAY[lang];
  const lvl: ReminderLevel = args.level ?? 1;
  const l = PAY_LEVELS[lang][lvl];
  const t = T[lang];
  const greeting = args.contactName ? `${t.hi} ${escapeHtml(args.contactName)},` : `${t.hi},`;
  const html = brandedEmail(`
      <p style="margin:0">${greeting}</p>
      <p>${escapeHtml(l.intro)}</p>
      <div style="margin:16px 0;padding:14px 18px;background:${COMPANY.cream};border-radius:10px">
        <div style="font-weight:600;color:${COMPANY.brown}">${escapeHtml(args.docNumber)}</div>
        <div style="font-size:14px;color:#555;margin-top:4px">${escapeHtml(p.openLabel)}: <strong>${escapeHtml(args.amount)}</strong></div>
        <div style="font-size:14px;color:#555">${escapeHtml(p.dueLabel)}: ${escapeHtml(args.dueDate)}</div>
      </div>
      <p>${escapeHtml(l.ask)}</p>
      ${bankBlockHtml(lang)}
      <hr style="border:none;border-top:1px solid ${COMPANY.sand};margin:24px 0 16px" />
      <p style="margin:0 0 4px">${t.regards}</p>
      <div style="font-size:13px;color:#888;line-height:1.7">${signatureHtml()}</div>`);
  const text =
    `${greeting}\n\n${l.intro}\n\n${args.docNumber}\n${p.openLabel}: ${args.amount}\n${p.dueLabel}: ${args.dueDate}\n\n${l.ask}${bankBlockText(lang)}\n\n${t.regards}\n${COMPANY.legalName}`;
  return { subject: l.subject(args.docNumber), html, text };
}

/** Verzamelherinnering: alle openstaande facturen (en creditnota's) in één overzicht. */
const STMT: Record<Lang, { subject: string; intro: string; colDoc: string; colDue: string; colAmount: string; creditLabel: string; totalLabel: string }> = {
  nl: { subject: "Overzicht van uw openstaande facturen", intro: "Hierbij een overzicht van de posten die volgens onze administratie nog openstaan.", colDoc: "Factuur", colDue: "Vervaldatum", colAmount: "Openstaand", creditLabel: "Creditnota", totalLabel: "Totaal te voldoen" },
  en: { subject: "Overview of your outstanding invoices", intro: "Please find below an overview of the items that are still outstanding according to our records.", colDoc: "Invoice", colDue: "Due date", colAmount: "Outstanding", creditLabel: "Credit note", totalLabel: "Total payable" },
  es: { subject: "Resumen de sus facturas pendientes", intro: "A continuación encontrará un resumen de las partidas que según nuestros registros siguen pendientes.", colDoc: "Factura", colDue: "Vencimiento", colAmount: "Pendiente", creditLabel: "Abono", totalLabel: "Total a pagar" },
  de: { subject: "Übersicht Ihrer offenen Rechnungen", intro: "Nachstehend finden Sie eine Übersicht der Posten, die nach unseren Unterlagen noch offen sind.", colDoc: "Rechnung", colDue: "Fälligkeit", colAmount: "Offen", creditLabel: "Gutschrift", totalLabel: "Zu zahlender Gesamtbetrag" },
};

export function accountReminderEmail(args: {
  lang?: string | null;
  contactName?: string | null;
  level?: ReminderLevel;
  invoices: { docNumber: string; dueDate: string; amount: string }[];
  credits: { docNumber: string; amount: string }[];
  total: string;
}): { subject: string; html: string; text: string } {
  const lang = pickLang(args.lang);
  const lvl: ReminderLevel = args.level ?? 1;
  const l = PAY_LEVELS[lang][lvl];
  const s = STMT[lang];
  const t = T[lang];
  const greeting = args.contactName ? `${t.hi} ${escapeHtml(args.contactName)},` : `${t.hi},`;
  const levelTag = lvl === 2 ? ` (${lang === "nl" ? "2e herinnering" : lang === "de" ? "2. Erinnerung" : lang === "es" ? "2º recordatorio" : "2nd reminder"})` : lvl === 3 ? ` (${lang === "nl" ? "aanmaning" : lang === "de" ? "Mahnung" : lang === "es" ? "requerimiento" : "final notice"})` : "";

  const rows = [
    ...args.invoices.map(
      (i) => `<tr>
        <td style="padding:6px 10px;border-top:1px solid ${COMPANY.sand}">${escapeHtml(i.docNumber)}</td>
        <td style="padding:6px 10px;border-top:1px solid ${COMPANY.sand};color:#777">${escapeHtml(i.dueDate)}</td>
        <td style="padding:6px 10px;border-top:1px solid ${COMPANY.sand};text-align:right">${escapeHtml(i.amount)}</td></tr>`,
    ),
    ...args.credits.map(
      (c) => `<tr>
        <td style="padding:6px 10px;border-top:1px solid ${COMPANY.sand}">${escapeHtml(s.creditLabel)} ${escapeHtml(c.docNumber)}</td>
        <td style="padding:6px 10px;border-top:1px solid ${COMPANY.sand}"></td>
        <td style="padding:6px 10px;border-top:1px solid ${COMPANY.sand};text-align:right;color:#16794a">${escapeHtml(c.amount)}</td></tr>`,
    ),
  ].join("");

  const html = brandedEmail(`
      <p style="margin:0">${greeting}</p>
      <p>${escapeHtml(s.intro)}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
        <thead><tr>
          <th style="text-align:left;padding:6px 10px;color:#777;font-weight:600">${escapeHtml(s.colDoc)}</th>
          <th style="text-align:left;padding:6px 10px;color:#777;font-weight:600">${escapeHtml(s.colDue)}</th>
          <th style="text-align:right;padding:6px 10px;color:#777;font-weight:600">${escapeHtml(s.colAmount)}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="2" style="padding:10px;border-top:2px solid ${COMPANY.brown};font-weight:700">${escapeHtml(s.totalLabel)}</td>
          <td style="padding:10px;border-top:2px solid ${COMPANY.brown};text-align:right;font-weight:700">${escapeHtml(args.total)}</td>
        </tr></tfoot>
      </table>
      <p>${escapeHtml(l.ask)}</p>
      ${bankBlockHtml(lang)}
      <hr style="border:none;border-top:1px solid ${COMPANY.sand};margin:24px 0 16px" />
      <p style="margin:0 0 4px">${t.regards}</p>
      <div style="font-size:13px;color:#888;line-height:1.7">${signatureHtml()}</div>`);

  const textLines = [
    ...args.invoices.map((i) => `${i.docNumber}  ${i.dueDate}  ${i.amount}`),
    ...args.credits.map((c) => `${s.creditLabel} ${c.docNumber}  ${c.amount}`),
  ].join("\n");
  const text = `${greeting}\n\n${s.intro}\n\n${textLines}\n${s.totalLabel}: ${args.total}\n\n${l.ask}${bankBlockText(lang)}\n\n${t.regards}\n${COMPANY.legalName}`;

  return { subject: `${s.subject}${levelTag}`, html, text };
}

/** Review-verzoek: enige tijd na levering vragen of de klant een review wil plaatsen. */
const REVIEW: Record<Lang, { subject: string; intro: string; ask: string; cta: string; thanks: string }> = {
  nl: {
    subject: "Tevreden? Een korte review zou ons enorm helpen",
    intro: "Hartelijk dank dat u voor Habitat One heeft gekozen. We hopen dat u inmiddels volop geniet van uw aankoop.",
    ask: "Zou u een momentje willen nemen om uw ervaring te delen? Een korte Google-review helpt ons enorm — en helpt anderen een goede keuze te maken.",
    cta: "Laat een review achter",
    thanks: "Alvast heel hartelijk dank!",
  },
  en: {
    subject: "Happy with your purchase? A short review would mean a lot",
    intro: "Thank you for choosing Habitat One. We hope you are already enjoying your purchase.",
    ask: "Would you take a moment to share your experience? A short Google review helps us enormously — and helps others make a good choice.",
    cta: "Leave a review",
    thanks: "Thank you so much in advance!",
  },
  es: {
    subject: "¿Contento con su compra? Una breve reseña nos ayudaría mucho",
    intro: "Muchas gracias por elegir Habitat One. Esperamos que ya esté disfrutando de su compra.",
    ask: "¿Podría dedicar un momento a compartir su experiencia? Una breve reseña en Google nos ayuda muchísimo y ayuda a otros a elegir bien.",
    cta: "Dejar una reseña",
    thanks: "¡Muchas gracias de antemano!",
  },
  de: {
    subject: "Zufrieden? Eine kurze Bewertung würde uns sehr helfen",
    intro: "Vielen Dank, dass Sie sich für Habitat One entschieden haben. Wir hoffen, Sie genießen Ihren Kauf bereits.",
    ask: "Würden Sie sich einen Moment Zeit nehmen, um Ihre Erfahrung zu teilen? Eine kurze Google-Bewertung hilft uns sehr — und hilft anderen bei der Wahl.",
    cta: "Bewertung abgeben",
    thanks: "Vielen Dank im Voraus!",
  },
};

export function reviewRequestEmail(args: {
  lang?: string | null;
  contactName?: string | null;
  reviewUrl: string;
}): { subject: string; html: string; text: string } {
  const lang = pickLang(args.lang);
  const r = REVIEW[lang];
  const t = T[lang];
  const greeting = args.contactName ? `${t.hi} ${escapeHtml(args.contactName)},` : `${t.hi},`;
  const html = brandedEmail(`
      <p style="margin:0">${greeting}</p>
      <p>${escapeHtml(r.intro)}</p>
      <p>${escapeHtml(r.ask)}</p>
      <p style="text-align:center;margin:26px 0">
        <a href="${args.reviewUrl}" style="display:inline-block;background:${COMPANY.brown};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">${escapeHtml(r.cta)}</a>
      </p>
      <p style="font-size:13px;color:#888">${escapeHtml(r.thanks)}</p>
      <hr style="border:none;border-top:1px solid ${COMPANY.sand};margin:24px 0 16px" />
      <p style="margin:0 0 4px">${t.regards}</p>
      <div style="font-size:13px;color:#888;line-height:1.7">${signatureHtml()}</div>`);
  const text = `${greeting}\n\n${r.intro}\n\n${r.ask}\n\n${r.cta}: ${args.reviewUrl}\n\n${r.thanks}\n\n${t.regards}\n${COMPANY.legalName}`;
  return { subject: r.subject, html, text };
}

/** Herinnering aan de klant: levering/ophaling/montage is (morgen) gepland. */
const REMIND: Record<Lang, Record<"leveren" | "ophalen" | "plaatsen", { subject: string; intro: string }>> = {
  nl: {
    leveren: { subject: "Herinnering: uw levering staat gepland", intro: "Een korte herinnering: uw bestelling wordt op onderstaande datum geleverd." },
    ophalen: { subject: "Herinnering: uw bestelling kunt u ophalen", intro: "Een korte herinnering: uw bestelling staat klaar om op te halen op onderstaande datum." },
    plaatsen: { subject: "Herinnering: uw montage staat gepland", intro: "Een korte herinnering: wij komen uw bestelling op onderstaande datum leveren en plaatsen." },
  },
  en: {
    leveren: { subject: "Reminder: your delivery is scheduled", intro: "A quick reminder: your order will be delivered on the date below." },
    ophalen: { subject: "Reminder: your order is ready for pickup", intro: "A quick reminder: your order is ready for pickup on the date below." },
    plaatsen: { subject: "Reminder: your installation is scheduled", intro: "A quick reminder: we will deliver and install your order on the date below." },
  },
  es: {
    leveren: { subject: "Recordatorio: su entrega está programada", intro: "Un recordatorio: su pedido se entregará en la fecha indicada a continuación." },
    ophalen: { subject: "Recordatorio: su pedido está listo para recoger", intro: "Un recordatorio: su pedido estará listo para recoger en la fecha indicada." },
    plaatsen: { subject: "Recordatorio: su instalación está programada", intro: "Un recordatorio: entregaremos e instalaremos su pedido en la fecha indicada." },
  },
  de: {
    leveren: { subject: "Erinnerung: Ihre Lieferung ist geplant", intro: "Eine kurze Erinnerung: Ihre Bestellung wird am unten genannten Datum geliefert." },
    ophalen: { subject: "Erinnerung: Ihre Bestellung ist abholbereit", intro: "Eine kurze Erinnerung: Ihre Bestellung ist am unten genannten Datum abholbereit." },
    plaatsen: { subject: "Erinnerung: Ihre Montage ist geplant", intro: "Eine kurze Erinnerung: Wir liefern und montieren Ihre Bestellung am unten genannten Datum." },
  },
};

export function deliveryReminderEmail(args: {
  lang?: string | null;
  contactName?: string | null;
  when: string;
  method?: "leveren" | "ophalen" | "plaatsen" | string | null;
  reference?: string | null;
}): { subject: string; html: string; text: string } {
  const lang = pickLang(args.lang);
  const variant = args.method === "ophalen" ? "ophalen" : args.method === "plaatsen" ? "plaatsen" : "leveren";
  const r = REMIND[lang][variant];
  const d = DELIV[lang][variant];
  const t = T[lang];
  const greeting = args.contactName ? `${t.hi} ${escapeHtml(args.contactName)},` : `${t.hi},`;
  const ref = args.reference ? `<div style="font-size:14px;color:#555;margin-top:3px">${escapeHtml(args.reference)}</div>` : "";
  const html = brandedEmail(`
      <p style="margin:0">${greeting}</p>
      <p>${escapeHtml(r.intro)}</p>
      <div style="margin:16px 0;padding:14px 18px;background:${COMPANY.cream};border-radius:10px">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#999">${escapeHtml(d.whenLabel)}</div>
        <div style="font-size:17px;font-weight:600;color:${COMPANY.brown};margin-top:2px">${escapeHtml(args.when)}</div>
        ${ref}
      </div>
      <hr style="border:none;border-top:1px solid ${COMPANY.sand};margin:24px 0 16px" />
      <p style="margin:0 0 4px">${t.regards}</p>
      <div style="font-size:13px;color:#888;line-height:1.7">${signatureHtml()}</div>`);
  const text = `${greeting}\n\n${r.intro}\n\n${d.whenLabel}: ${args.when}${args.reference ? ` (${args.reference})` : ""}\n\n${t.regards}\n${COMPANY.legalName}`;
  return { subject: r.subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function pickLang(l?: string | null): Lang {
  return (["en", "nl", "es", "de"] as const).includes(l as Lang) ? (l as Lang) : "en";
}

/** Gebrande e-mail-shell (cream achtergrond, wordmark-header). */
function brandedEmail(inner: string): string {
  return `<div style="font-family:Helvetica,Arial,sans-serif;background:${COMPANY.cream};padding:24px 0">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;color:#1c1c1a">
    <div style="background:${COMPANY.cream};padding:22px 28px">
      ${logoHeaderHtml()}
      <div style="font-size:11px;color:#999;margin-top:4px">${escapeHtml(COMPANY.tagline)}</div>
    </div>
    <div style="padding:24px 28px">${inner}</div>
  </div>
</div>`;
}

const APPT: Record<
  Lang,
  {
    recvSubject: string;
    recvBody: string;
    recvConfirm: string;
    whenLabel: string;
    confSubject: string;
    confBody: string;
    locationLabel: string;
  }
> = {
  nl: {
    recvSubject: "We hebben je afspraakverzoek ontvangen",
    recvBody: "Bedankt voor je verzoek voor een bezoek aan onze showroom.",
    recvConfirm:
      "We bevestigen je afspraak zo snel mogelijk per e-mail — of stellen een alternatieve datum voor als het gekozen moment bij ons niet uitkomt.",
    whenLabel: "Voorkeursmoment",
    confSubject: "Je afspraak is bevestigd",
    confBody: "We kijken ernaar uit je te ontvangen in onze showroom:",
    locationLabel: "Locatie",
  },
  en: {
    recvSubject: "We've received your appointment request",
    recvBody: "Thank you for requesting a visit to our showroom.",
    recvConfirm:
      "We'll confirm your appointment by email as soon as possible — or suggest an alternative date if the chosen time doesn't suit us.",
    whenLabel: "Preferred time",
    confSubject: "Your appointment is confirmed",
    confBody: "We look forward to welcoming you to our showroom:",
    locationLabel: "Location",
  },
  es: {
    recvSubject: "Hemos recibido tu solicitud de cita",
    recvBody: "Gracias por solicitar una visita a nuestro showroom.",
    recvConfirm:
      "Confirmaremos tu cita por correo lo antes posible, o te propondremos una fecha alternativa si la hora elegida no nos viene bien.",
    whenLabel: "Hora preferida",
    confSubject: "Tu cita está confirmada",
    confBody: "Estaremos encantados de recibirte en nuestro showroom:",
    locationLabel: "Ubicación",
  },
  de: {
    recvSubject: "Wir haben deine Terminanfrage erhalten",
    recvBody: "Vielen Dank für deine Anfrage für einen Besuch in unserem Showroom.",
    recvConfirm:
      "Wir bestätigen deinen Termin so schnell wie möglich per E-Mail – oder schlagen einen alternativen Termin vor, falls der gewählte Zeitpunkt nicht passt.",
    whenLabel: "Wunschtermin",
    confSubject: "Dein Termin ist bestätigt",
    confBody: "Wir freuen uns, dich in unserem Showroom begrüßen zu dürfen:",
    locationLabel: "Standort",
  },
};

// Voorstel-mail: meerdere alternatieve momenten waaruit de klant kiest.
const APPT_PROPOSE: Record<Lang, { subject: string; body: string; cta: string }> = {
  nl: {
    subject: "Een nieuw moment voor je showroombezoek",
    body: "Bedankt voor je verzoek om onze showroom in Jávea te bezoeken. Het door jou aangegeven moment komt bij ons helaas net niet uit. Daarom hebben we alvast een aantal dagen en tijden doorgestuurd die ons wél goed uitkomen. Kies hieronder het moment dat jóú het beste past, dan bevestigen we je afspraak meteen en zien we je graag.",
    cta: "Kies een moment",
  },
  en: {
    subject: "A new time for your showroom visit",
    body: "Thank you for your request to visit our showroom in Jávea. Unfortunately the time you indicated doesn't quite work on our side. We've therefore put forward a few days and times that do suit us. Simply choose the moment that works best for you below, and we'll confirm your appointment right away — we look forward to welcoming you.",
    cta: "Choose a time",
  },
  es: {
    subject: "Un nuevo momento para tu visita al showroom",
    body: "Gracias por tu solicitud para visitar nuestro showroom en Jávea. Lamentablemente el momento que indicaste no nos viene del todo bien. Por eso te proponemos varios días y horas que sí nos convienen. Elige a continuación el que mejor te venga y confirmaremos tu cita de inmediato. ¡Te esperamos!",
    cta: "Elegir un momento",
  },
  de: {
    subject: "Ein neuer Termin für deinen Showroom-Besuch",
    body: "Vielen Dank für deine Anfrage, unseren Showroom in Jávea zu besuchen. Der von dir angegebene Zeitpunkt passt bei uns leider nicht ganz. Deshalb haben wir dir einige Tage und Uhrzeiten vorgeschlagen, die uns gut passen. Wähle unten einfach den Moment, der dir am besten passt, und wir bestätigen deinen Termin sofort — wir freuen uns auf deinen Besuch.",
    cta: "Moment wählen",
  },
};

/** Voorstel met alternatieve afspraakmomenten + link naar de publieke kies-pagina. */
export function appointmentProposalEmail(args: {
  lang?: string | null;
  contactName?: string | null;
  url: string;
}): { subject: string; html: string; text: string } {
  const lang = pickLang(args.lang);
  const a = APPT_PROPOSE[lang];
  const t = T[lang];
  const greeting = args.contactName ? `${t.hi} ${escapeHtml(args.contactName)},` : `${t.hi},`;
  const html = brandedEmail(`
      <p style="margin:0">${greeting}</p>
      <p>${a.body}</p>
      <p style="margin:26px 0">
        <a href="${args.url}" style="display:inline-block;background:${COMPANY.brown};color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;font-size:15px">${a.cta}</a>
      </p>
      <hr style="border:none;border-top:1px solid ${COMPANY.sand};margin:24px 0 16px" />
  `);
  const text = `${greeting}\n\n${a.body}\n\n${a.cta}: ${args.url}`;
  return { subject: a.subject, html, text };
}

/** Ontvangstbevestiging van een showroom-afspraakverzoek (de afspraak is nog niet vast). */
export function appointmentReceivedEmail(args: {
  lang?: string | null;
  contactName?: string | null;
  when?: string | null;
}): { subject: string; html: string; text: string } {
  const lang = pickLang(args.lang);
  const a = APPT[lang];
  const t = T[lang];
  const greeting = args.contactName ? `${t.hi} ${escapeHtml(args.contactName)},` : `${t.hi},`;
  const whenBlock = args.when
    ? `<p style="margin:16px 0 4px;font-weight:600;color:${COMPANY.brown}">${a.whenLabel}</p>
      <p style="font-size:16px;margin:0 0 14px"><strong>${escapeHtml(args.when)}</strong></p>`
    : "";
  const html = brandedEmail(`
      <p style="margin:0">${greeting}</p>
      <p>${a.recvBody}</p>
      ${whenBlock}
      <p>${a.recvConfirm}</p>
      <hr style="border:none;border-top:1px solid ${COMPANY.sand};margin:24px 0 16px" />
      <p style="margin:0 0 4px">${t.regards}</p>
      <div style="font-size:13px;color:#888;line-height:1.7">${signatureHtml()}</div>`);
  const text =
    `${greeting}\n\n${a.recvBody}\n` +
    (args.when ? `\n${a.whenLabel}: ${args.when}\n` : "") +
    `\n${a.recvConfirm}\n\n${t.regards}\n${COMPANY.legalName}`;
  return { subject: a.recvSubject, html, text };
}

/** Definitieve bevestiging van een ingeplande showroom-afspraak. */
export function appointmentConfirmedEmail(args: {
  lang?: string | null;
  contactName?: string | null;
  when: string;
  location: string;
  note?: string | null;
}): { subject: string; html: string; text: string } {
  const lang = pickLang(args.lang);
  const a = APPT[lang];
  const t = T[lang];
  const greeting = args.contactName ? `${t.hi} ${escapeHtml(args.contactName)},` : `${t.hi},`;
  const html = brandedEmail(`
      <p style="margin:0">${greeting}</p>
      <p>${a.confBody}</p>
      <div style="margin:16px 0;padding:14px 18px;background:${COMPANY.cream};border-radius:10px">
        <div style="font-size:17px;font-weight:600;color:${COMPANY.brown}">${escapeHtml(args.when)}</div>
        <div style="font-size:14px;color:#555;margin-top:3px">${escapeHtml(args.location)}</div>
      </div>
      ${args.note ? `<p style="white-space:pre-wrap">${escapeHtml(args.note)}</p>` : ""}
      <hr style="border:none;border-top:1px solid ${COMPANY.sand};margin:24px 0 16px" />
      <p style="margin:0 0 4px">${t.regards}</p>
      <div style="font-size:13px;color:#888;line-height:1.7">${signatureHtml()}</div>`);
  const text =
    `${greeting}\n\n${a.confBody}\n\n${args.when}\n${args.location}` +
    (args.note ? `\n\n${args.note}` : "") +
    `\n\n${t.regards}\n${COMPANY.legalName}`;
  return { subject: a.confSubject, html, text };
}

/** Klantmail: de levering/ophaling is ingepland op een datum. */
type DelivCopy = { subject: string; intro: string; whenLabel: string };
const DELIV: Record<Lang, { leveren: DelivCopy; ophalen: DelivCopy; plaatsen: DelivCopy }> = {
  nl: {
    leveren: {
      subject: "Uw levering is ingepland",
      intro: `Goed nieuws — uw bestelling bij ${COMPANY.name} staat gepland voor levering.`,
      whenLabel: "Geplande leverdatum",
    },
    ophalen: {
      subject: "Uw bestelling staat klaar om op te halen",
      intro: `Goed nieuws — uw bestelling bij ${COMPANY.name} staat klaar. U kunt deze ophalen.`,
      whenLabel: "Ophaaldatum",
    },
    plaatsen: {
      subject: "Uw montage is ingepland",
      intro: `Goed nieuws — wij komen uw bestelling bij ${COMPANY.name} leveren en plaatsen.`,
      whenLabel: "Geplande montagedatum",
    },
  },
  en: {
    leveren: {
      subject: "Your delivery is scheduled",
      intro: `Good news — your order from ${COMPANY.name} is scheduled for delivery.`,
      whenLabel: "Scheduled delivery date",
    },
    ophalen: {
      subject: "Your order is ready for pickup",
      intro: `Good news — your order from ${COMPANY.name} is ready for pickup.`,
      whenLabel: "Pickup date",
    },
    plaatsen: {
      subject: "Your installation is scheduled",
      intro: `Good news — we will deliver and install your order from ${COMPANY.name}.`,
      whenLabel: "Scheduled installation date",
    },
  },
  es: {
    leveren: {
      subject: "Su entrega está programada",
      intro: `Buenas noticias: su pedido de ${COMPANY.name} está programado para entrega.`,
      whenLabel: "Fecha de entrega prevista",
    },
    ophalen: {
      subject: "Su pedido está listo para recoger",
      intro: `Buenas noticias: su pedido de ${COMPANY.name} está listo para recoger.`,
      whenLabel: "Fecha de recogida",
    },
    plaatsen: {
      subject: "Su instalación está programada",
      intro: `Buenas noticias: entregaremos e instalaremos su pedido de ${COMPANY.name}.`,
      whenLabel: "Fecha de instalación prevista",
    },
  },
  de: {
    leveren: {
      subject: "Ihre Lieferung ist geplant",
      intro: `Gute Nachrichten — Ihre Bestellung bei ${COMPANY.name} ist für die Lieferung geplant.`,
      whenLabel: "Geplantes Lieferdatum",
    },
    ophalen: {
      subject: "Ihre Bestellung ist zur Abholung bereit",
      intro: `Gute Nachrichten — Ihre Bestellung bei ${COMPANY.name} ist abholbereit.`,
      whenLabel: "Abholdatum",
    },
    plaatsen: {
      subject: "Ihre Montage ist geplant",
      intro: `Gute Nachrichten — wir liefern und montieren Ihre Bestellung bei ${COMPANY.name}.`,
      whenLabel: "Geplantes Montagedatum",
    },
  },
};

export function deliveryPlannedEmail(args: {
  lang?: string | null;
  contactName?: string | null;
  when: string;
  method?: "leveren" | "ophalen" | "plaatsen" | string | null;
  reference?: string | null;
  note?: string | null;
}): { subject: string; html: string; text: string } {
  const lang = pickLang(args.lang);
  const variant = args.method === "ophalen" ? "ophalen" : args.method === "plaatsen" ? "plaatsen" : "leveren";
  const d = DELIV[lang][variant];
  const t = T[lang];
  const greeting = args.contactName ? `${t.hi} ${escapeHtml(args.contactName)},` : `${t.hi},`;
  const ref = args.reference ? `<div style="font-size:14px;color:#555;margin-top:3px">${escapeHtml(args.reference)}</div>` : "";
  const html = brandedEmail(`
      <p style="margin:0">${greeting}</p>
      <p>${escapeHtml(d.intro)}</p>
      <div style="margin:16px 0;padding:14px 18px;background:${COMPANY.cream};border-radius:10px">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#999">${escapeHtml(d.whenLabel)}</div>
        <div style="font-size:17px;font-weight:600;color:${COMPANY.brown};margin-top:2px">${escapeHtml(args.when)}</div>
        ${ref}
      </div>
      ${args.note ? `<p style="white-space:pre-wrap">${escapeHtml(args.note)}</p>` : ""}
      <hr style="border:none;border-top:1px solid ${COMPANY.sand};margin:24px 0 16px" />
      <p style="margin:0 0 4px">${t.regards}</p>
      <div style="font-size:13px;color:#888;line-height:1.7">${signatureHtml()}</div>`);
  const text =
    `${greeting}\n\n${d.intro}\n\n${d.whenLabel}: ${args.when}` +
    (args.reference ? ` (${args.reference})` : "") +
    (args.note ? `\n\n${args.note}` : "") +
    `\n\n${t.regards}\n${COMPANY.legalName}`;
  return { subject: d.subject, html, text };
}
