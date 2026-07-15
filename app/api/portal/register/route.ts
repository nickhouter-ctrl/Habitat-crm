import { z } from "zod";

import { db } from "@/lib/db";
import { accountRequests } from "@/lib/db/schema";
import { sendMail } from "@/lib/gmail";
import { jsonCors, portalCors } from "@/lib/portal/api";
import { clientIp, rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

/** Publieke endpoint: accountaanvraag vanaf habitat-one.com. */

const schema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    kind: z.enum(["particulier", "zakelijk"]),
    businessName: z.string().trim().max(200).optional().or(z.literal("")),
    vatNumber: z.string().trim().max(60).optional().or(z.literal("")),
    address: z.string().trim().max(400).optional().or(z.literal("")),
    locale: z.enum(["nl", "de", "en", "es"]).optional(),
    message: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .refine((v) => v.kind !== "zakelijk" || (!!v.businessName && !!v.vatNumber), {
    message: "Bij een zakelijk account zijn bedrijfsnaam en IVA/BTW-nummer verplicht.",
  });

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: portalCors(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  // Elke aanvraag triggert intern een mail — begrens per IP tegen spam.
  if (!(await rateLimit(`portal-register:ip:${clientIp(req)}`, 5, 3600))) {
    return jsonCors(RATE_LIMITED, 429, origin);
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonCors({ ok: false, error: "invalid-json" }, 400, origin);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return jsonCors({ ok: false, error: "validation", issues: parsed.error.issues.map((i) => i.message) }, 400, origin);
  }
  const v = parsed.data;

  const [row] = await db
    .insert(accountRequests)
    .values({
      name: v.name,
      email: v.email.toLowerCase(),
      phone: v.phone || null,
      kind: v.kind,
      businessName: v.businessName || null,
      vatNumber: v.vatNumber || null,
      address: v.address || null,
      locale: v.locale ?? null,
      message: v.message || null,
    })
    .returning({ id: accountRequests.id });

  // Team-melding (mag nooit de opslag breken).
  try {
    const crmUrl = process.env.APP_URL || "https://habitat-crm-delta.vercel.app";
    const rows: [string, string][] = [
      ["Naam", v.name],
      ["E-mail", v.email],
      ["Telefoon", v.phone || "—"],
      ["Type", v.kind === "zakelijk" ? "Zakelijk" : "Particulier"],
      ["Bedrijf", v.businessName || "—"],
      ["IVA/BTW", v.vatNumber || "—"],
      ["Adres", v.address || "—"],
      ["Bericht", v.message || "—"],
    ];
    const kindLabel = v.kind === "zakelijk" ? "zakelijk" : "particulier";
    await sendMail({
      to: process.env.NOTIFY_EMAIL?.trim() || "nick@habitat-one.com",
      replyTo: v.email,
      subject: `Nieuwe accountaanvraag — accepteer of weiger (${v.name})`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#2a2620;max-width:560px">
  <h2 style="color:#402419;margin:0 0 8px">Nieuwe accountaanvraag</h2>
  <p style="margin:0 0 16px;font-size:14px;line-height:1.5">Er wil een nieuwe klant een account aanmaken (<strong>${kindLabel}</strong>). Bekijk de gegevens hieronder en <strong>accepteer of weiger</strong> de aanvraag in het CRM.</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">${rows
    .map(([k, val]) => `<tr><td style="padding:6px 10px;color:#7a6a58;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:6px 10px;white-space:pre-wrap">${escapeHtml(val)}</td></tr>`)
    .join("")}</table>
  <p style="margin:22px 0 0"><a href="${crmUrl}/accounts" style="background:#b5532b;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-size:14px">Accepteren of weigeren →</a></p>
  <p style="margin:12px 0 0;font-size:12px;color:#9a8a78">Je kunt ook direct op deze mail antwoorden om de klant te bereiken.</p>
</div>`,
      text: `Er wil een nieuwe klant (${kindLabel}) een account aanmaken. Accepteer of weiger de aanvraag in het CRM:\n\n${rows.map(([k, val]) => `${k}: ${val}`).join("\n")}\n\nBeoordelen: ${crmUrl}/accounts`,
    });
  } catch (err) {
    console.warn("[portal/register] meldings-mail mislukt:", err);
  }

  return jsonCors({ ok: true, id: row.id }, 201, origin);
}
