import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { quoteRequests } from "@/lib/db/schema";
import { sendMail } from "@/lib/gmail";
import { quoteRequestReceivedEmail } from "@/lib/email";

/**
 * Publieke endpoint waar habitat-one (of een andere bron) een offerte-aanvraag
 * naar kan POSTen. Geen auth — basic CORS + input-validatie.
 */

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  message: z.string().trim().max(4000).optional().or(z.literal("")),
  productSkus: z.array(z.string()).max(50).optional(),
  productNames: z.array(z.string()).max(50).optional(),
  productSlugs: z.array(z.string()).max(50).optional(),
  // Absolute thumbnail-URL's per regel (voor mooiere bevestigingsmail).
  productImages: z.array(z.string()).max(50).optional(),
  locale: z.enum(["nl", "de", "en", "es"]).optional(),
  source: z.string().trim().max(80).optional(),
  // Onderscheid offerte-aanvraag vs. algemeen contactbericht / afspraak.
  kind: z.enum(["quote", "contact", "appointment"]).optional(),
});

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

function corsHeaders(origin?: string | null): HeadersInit {
  // Sta habitat-one en lokale dev toe. Andere oorsprongs vallen door op same-origin.
  const allow = origin && /habitat-one|vercel\.app|localhost|127\.0\.0\.1/i.test(origin) ? origin : "*";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  let payload: unknown;
  try { payload = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400, headers: corsHeaders(origin) });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400, headers: corsHeaders(origin) },
    );
  }
  const v = parsed.data;

  const [row] = await db
    .insert(quoteRequests)
    .values({
      name: v.name,
      email: v.email,
      phone: v.phone || null,
      company: v.company || null,
      message: v.message || null,
      productSkus: v.productSkus?.length ? v.productSkus : null,
      productNames: v.productNames?.length ? v.productNames : null,
      productSlugs: v.productSlugs?.length ? v.productSlugs : null,
      locale: v.locale ?? null,
      source: v.source?.trim() || "website",
    })
    .returning({ id: quoteRequests.id });

  // Meldings-mail naar Habitat One via Gmail (GMAIL_USER/GMAIL_APP_PASSWORD).
  // In try/catch — een mail-fout mag het opslaan van de aanvraag nooit breken.
  let mailStatus = "skipped";
  try {
    const crmUrl = process.env.APP_URL || "https://habitat-crm-delta.vercel.app";
    const kindLabel =
      v.kind === "contact"
        ? "Nieuw contactbericht"
        : v.kind === "appointment"
          ? "Nieuwe afspraakaanvraag"
          : "Nieuwe offerte-aanvraag";
    const rows: [string, string][] = [
      ["Naam", v.name],
      ["E-mail", v.email],
      ["Telefoon", v.phone || "—"],
      ["Bedrijf", v.company || "—"],
      ["Producten", v.productNames?.length ? v.productNames.join(", ") : "—"],
      ["Herkomst", v.source?.trim() || "website"],
      ["Bericht", v.message || "—"],
    ];
    await sendMail({
      to:
        process.env.NOTIFY_EMAIL?.trim() ||
        "hi@habitat-one.com, purchase@habitat-one.com",
      replyTo: v.email,
      subject: `${kindLabel} — ${v.name}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#2a2620;max-width:560px">
  <h2 style="color:#402419;margin:0 0 14px">${kindLabel}</h2>
  <table style="border-collapse:collapse;width:100%;font-size:14px">${rows
    .map(
      ([k, val]) =>
        `<tr><td style="padding:6px 10px;color:#7a6a58;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:6px 10px;white-space:pre-wrap">${escapeHtml(val)}</td></tr>`,
    )
    .join("")}</table>
  <p style="margin:20px 0 0"><a href="${crmUrl}/aanvragen/${row.id}" style="background:#b5532b;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-size:14px">Bekijk in het CRM</a></p>
</div>`,
      text:
        rows.map(([k, val]) => `${k}: ${val}`).join("\n") +
        `\n\nCRM: ${crmUrl}/aanvragen/${row.id}`,
    });
    mailStatus = "sent";
  } catch (err) {
    mailStatus = `failed: ${err instanceof Error ? err.message : String(err)}`;
    console.warn("[quote-requests] meldings-mail mislukt:", err);
  }

  // Bevestigingsmail naar de klant, in de op de website gekozen taal (fallback
  // Engels). Ook hier: een mail-fout mag de opgeslagen aanvraag nooit breken.
  // Klant-bevestiging alleen bij een echte offerte-aanvraag; een algemeen
  // contactbericht / afspraak krijgt (nog) geen automatische bevestiging.
  let confirmStatus = "skipped";
  if (v.kind === "contact" || v.kind === "appointment") {
    confirmStatus = "n/a";
  } else {
    try {
      const confirm = quoteRequestReceivedEmail({
        lang: v.locale,
        contactName: v.name,
        products: v.productNames?.length
          ? v.productNames.map((name, idx) => ({
              name,
              image: v.productImages?.[idx] || null,
            }))
          : null,
      });
      await sendMail({
        to: v.email,
        subject: confirm.subject,
        html: confirm.html,
        text: confirm.text,
      });
      confirmStatus = "sent";
    } catch (err) {
      confirmStatus = `failed: ${err instanceof Error ? err.message : String(err)}`;
      console.warn("[quote-requests] klant-bevestiging mislukt:", err);
    }
  }

  return NextResponse.json(
    { ok: true, id: row.id, mail: mailStatus, confirm: confirmStatus },
    { status: 201, headers: corsHeaders(origin) },
  );
}
