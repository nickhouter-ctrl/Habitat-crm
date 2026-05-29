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

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}): Promise<{ sent: boolean; reason?: string }> {
  // Voorkeur: Gmail (dezelfde route als de meldingsmails — verstuurt vanaf
  // GMAIL_USER, bv. hi@habitat-one.com). Valt terug op Resend; en als niets is
  // ingesteld een stub, zodat de accept-link altijd in het CRM blijft staan.
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      const { sendMail } = await import("@/lib/gmail");
      await sendMail({
        to: input.to,
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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const kindNL = (k: string) => (k === "invoice" ? "factuur" : k === "proforma" ? "pro-formafactuur" : k === "creditnote" ? "creditnota" : "offerte");
const kindEN = (k: string) => (k === "invoice" ? "invoice" : k === "proforma" ? "pro-forma invoice" : k === "creditnote" ? "credit note" : "quote");
const kindES = (k: string) => (k === "invoice" ? "factura" : k === "proforma" ? "factura proforma" : k === "creditnote" ? "nota de crédito" : "presupuesto");
const kindDE = (k: string) => (k === "invoice" ? "Rechnung" : k === "proforma" ? "Proforma-Rechnung" : k === "creditnote" ? "Gutschrift" : "Angebot");

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
    intro: (k) => `Hierbij ontvangt u onze ${kindNL(k)} (zie ook de PDF-bijlage). U kunt deze online bekijken en — als het een offerte is — direct akkoord geven of afwijzen:`,
    review: (k) => `Bekijk de ${kindNL(k)}`,
    accept: "Offerte accepteren",
    pdf: "PDF downloaden",
    regards: "Met vriendelijke groet,",
  },
  en: {
    subject: (nr, k) => `${cap(kindEN(k))} ${nr} from ${COMPANY.name}`,
    hi: "Dear",
    intro: (k) => `Please find our ${kindEN(k)} below (also attached as PDF). You can review it online and — for a quote — approve or decline it:`,
    review: (k) => `View the ${kindEN(k)}`,
    accept: "Accept quote",
    pdf: "Download PDF",
    regards: "Kind regards,",
  },
  es: {
    subject: (nr, k) => `${cap(kindES(k))} ${nr} de ${COMPANY.name}`,
    hi: "Estimado/a",
    intro: (k) => `Le enviamos nuestro/a ${kindES(k)} (también adjunto en PDF). Puede revisarlo en línea y — si es un presupuesto — aprobarlo o rechazarlo:`,
    review: (k) => `Ver el/la ${kindES(k)}`,
    accept: "Aceptar presupuesto",
    pdf: "Descargar PDF",
    regards: "Un saludo,",
  },
  de: {
    subject: (nr, k) => `${cap(kindDE(k))} ${nr} von ${COMPANY.name}`,
    hi: "Sehr geehrte/r",
    intro: (k) => `Anbei unser/e ${kindDE(k)} (auch als PDF im Anhang). Sie können es online ansehen und — bei einem Angebot — direkt annehmen oder ablehnen:`,
    review: (k) => `${cap(kindDE(k))} ansehen`,
    accept: "Angebot annehmen",
    pdf: "PDF herunterladen",
    regards: "Mit freundlichen Grüßen,",
  },
};

function signatureHtml(): string {
  const parts = [
    COMPANY.legalName,
    COMPANY.address,
    [COMPANY.phone, COMPANY.email].filter(Boolean).join(" · "),
    COMPANY.website,
    COMPANY.vatNumber ? `NIF ${COMPANY.vatNumber}` : "",
  ].filter(Boolean);
  return parts.map((p) => `<span style="display:block">${escapeHtml(p)}</span>`).join("");
}

export function offerteEmail(args: {
  lang?: string | null;
  kind?: string;
  docNumber: string;
  title?: string | null;
  contactName?: string | null;
  url: string;
}): { subject: string; html: string; text: string } {
  const lang: Lang = (["en", "nl", "es", "de"] as const).includes(args.lang as Lang)
    ? (args.lang as Lang)
    : "es";
  const t = T[lang];
  const kind = args.kind ?? "estimate";
  const nr = args.docNumber || "—";
  const subject = t.subject(nr, kind);
  const greeting = args.contactName ? `${t.hi} ${escapeHtml(args.contactName)},` : `${t.hi},`;
  const title = args.title ? `<p style="color:#555;margin:4px 0 0">${escapeHtml(args.title)}</p>` : "";
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;background:${COMPANY.cream};padding:24px 0">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;color:#1c1c1a">
    <div style="background:${COMPANY.cream};padding:22px 28px">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:4px;color:${COMPANY.brown};line-height:1.05">${COMPANY.wordmark1}<br/>${COMPANY.wordmark2}</div>
      <div style="font-size:11px;color:#999;margin-top:4px">${escapeHtml(COMPANY.tagline)}</div>
    </div>
    <div style="padding:24px 28px">
      <p style="margin:0">${greeting}</p>
      <p>${t.intro(kind)}</p>
      ${title}
      <p style="margin:24px 0 12px">
        <a href="${args.url}" style="background:${COMPANY.accent};color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600">${t.review(kind)} (${nr})</a>
      </p>
      ${
        kind === "estimate"
          ? `<p style="margin:0 0 20px">
        <a href="${args.url}?actie=accepteren" style="background:#2e7d32;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600">✓ ${t.accept}</a>
      </p>`
          : ""
      }
      <p style="font-size:13px"><a href="${args.url}/pdf" style="color:${COMPANY.accent}">${t.pdf}</a></p>
      <p style="font-size:12px;color:#aaa;word-break:break-all">${escapeHtml(args.url)}</p>
      <p style="margin-top:28px">${t.regards}</p>
      <div style="font-size:13px;color:#555;margin-top:6px">${signatureHtml()}</div>
    </div>
  </div>
</div>`;
  const text = `${greeting}\n\n${t.intro(kind)}\n\n${t.review(kind)}: ${args.url}\n${t.pdf}: ${args.url}/pdf\n\n${t.regards}\n${COMPANY.legalName}\n${COMPANY.address}\n${[COMPANY.phone, COMPANY.email].filter(Boolean).join(" · ")}`;
  return { subject, html, text };
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
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:4px;color:${COMPANY.brown};line-height:1.05">${COMPANY.wordmark1}<br/>${COMPANY.wordmark2}</div>
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
