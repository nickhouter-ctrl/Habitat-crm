/**
 * Email sending. Currently a stub: until an email provider is configured (e.g.
 * RESEND_API_KEY + EMAIL_FROM), `sendEmail` just logs. The accept link is always
 * returned/shown in the CRM so it can be copy-pasted in the meantime.
 */
type Lang = "en" | "nl" | "es" | "de";

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.log(
      `[habitat-crm] (email stub — not configured) → to=${input.to} subject="${input.subject}"`,
    );
    return { sent: false, reason: "not-configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
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

const T: Record<
  Lang,
  {
    subject: (nr: string) => string;
    intro: string;
    review: string;
    accept: string;
    reject: string;
    regards: string;
  }
> = {
  nl: {
    subject: (nr) => `Offerte ${nr} van Habitat One`,
    intro: "Hierbij ontvangt u onze offerte. U kunt deze online bekijken en akkoord geven:",
    review: "Bekijk de offerte",
    accept: "Accepteren",
    reject: "Afwijzen",
    regards: "Met vriendelijke groet,\nHabitat One",
  },
  en: {
    subject: (nr) => `Quote ${nr} from Habitat One`,
    intro: "Please find our quote below. You can review it online and approve it:",
    review: "View the quote",
    accept: "Accept",
    reject: "Decline",
    regards: "Kind regards,\nHabitat One",
  },
  es: {
    subject: (nr) => `Presupuesto ${nr} de Habitat One`,
    intro: "Le enviamos nuestro presupuesto. Puede revisarlo en línea y aprobarlo:",
    review: "Ver el presupuesto",
    accept: "Aceptar",
    reject: "Rechazar",
    regards: "Un saludo,\nHabitat One",
  },
  de: {
    subject: (nr) => `Angebot ${nr} von Habitat One`,
    intro: "Anbei unser Angebot. Sie können es online ansehen und freigeben:",
    review: "Angebot ansehen",
    accept: "Annehmen",
    reject: "Ablehnen",
    regards: "Mit freundlichen Grüßen,\nHabitat One",
  },
};

export function offerteEmail(args: {
  lang?: string | null;
  docNumber: string;
  title?: string | null;
  url: string;
}): { subject: string; html: string; text: string } {
  const lang: Lang = (["en", "nl", "es", "de"] as const).includes(args.lang as Lang)
    ? (args.lang as Lang)
    : "es";
  const t = T[lang];
  const nr = args.docNumber || "—";
  const subject = t.subject(nr);
  const title = args.title ? `<p style="color:#555">${escapeHtml(args.title)}</p>` : "";
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1c1c1a">
  <h2 style="margin:0 0 4px">Habitat One</h2>
  ${title}
  <p>${t.intro}</p>
  <p style="margin:24px 0">
    <a href="${args.url}" style="background:#1f6f5c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">${t.review}</a>
  </p>
  <p style="font-size:13px;color:#777">${escapeHtml(args.url)}</p>
  <p style="white-space:pre-line;margin-top:24px">${t.regards}</p>
</div>`;
  const text = `${t.intro}\n${args.url}\n\n${t.regards}`;
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
