import { NextResponse } from "next/server";
import { z } from "zod";

import { INTERESSES, ROLLEN } from "@/lib/beurs";
import { slaBeursbezoekerOp } from "@/lib/beurs-opslag";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * De QR-code op de stand wijst naar habitat-one.com/beurs. Dat formulier POST
 * hierheen.
 *
 * Bewust een eigen endpoint en niet `/api/quote-requests`: een bezoeker die
 * zelf invult moet exact hetzelfde opleveren als wanneer wij het op de iPad
 * intikken (contact met rol-tag, aanvraag in de opvolglijst, bevestigingsmail),
 * en dat is andere invoer dan een offerte-aanvraag.
 *
 * Wat hier binnenkomt gaat er nooit weer uit: het endpoint schrijft alleen, en
 * antwoordt met niets meer dan "gelukt". Het CRM zelf blijft dicht; de bezoeker
 * ziet alleen de website.
 */

const schema = z.object({
  naam: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(200),
  telefoon: z.string().trim().max(60).optional().or(z.literal("")),
  bedrijf: z.string().trim().max(160).optional().or(z.literal("")),
  rol: z.enum(ROLLEN.map((r) => r.key) as [string, ...string[]]),
  rolAnders: z.string().trim().max(120).optional().or(z.literal("")),
  interesses: z.array(z.enum(INTERESSES.map((i) => i.key) as [string, ...string[]])).max(10).optional(),
  plaats: z.string().trim().max(160).optional().or(z.literal("")),
  land: z.string().trim().max(2).optional().or(z.literal("")),
  taal: z.enum(["nl", "en", "es"]),
  wens: z.string().trim().max(2000).optional().or(z.literal("")),
  /** Verborgen veld; alleen een bot vult dit in. */
  website: z.string().max(200).optional(),
});

function corsHeaders(origin?: string | null): HeadersInit {
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
  const cors = corsHeaders(origin);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400, headers: cors });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400, headers: cors },
    );
  }
  const d = parsed.data;

  // Bot: doe alsof het gelukt is, sla niets op.
  if (d.website?.trim()) {
    return NextResponse.json({ ok: true }, { status: 201, headers: cors });
  }

  // Op een beursvloer zit de hele hal achter één wifi-adres, dus de IP-teller
  // staat ruim; de echte rem staat per e-mailadres, tegen dubbel indrukken en
  // tegen iemand die een ander adres wil laten vollopen.
  const adres = d.email.trim().toLowerCase();
  if (!(await rateLimit(`beurs:mail:${adres}`, 3, 3600))) {
    return NextResponse.json({ ok: false, error: "te-vaak" }, { status: 429, headers: cors });
  }
  if (!(await rateLimit(`beurs:ip:${clientIp(req)}`, 120, 3600))) {
    return NextResponse.json({ ok: false, error: "te-vaak" }, { status: 429, headers: cors });
  }

  try {
    const res = await slaBeursbezoekerOp({
      naam: d.naam,
      email: d.email,
      telefoon: d.telefoon,
      bedrijf: d.bedrijf,
      rol: d.rol,
      rolAnders: d.rolAnders,
      interesses: d.interesses,
      plaats: d.plaats,
      land: d.land,
      taal: d.taal,
      wens: d.wens,
      zelfIngevuld: true,
    });
    // Geen id's terug: de bezoeker hoeft niets van het CRM te weten.
    return NextResponse.json({ ok: true, mail: res.mail }, { status: 201, headers: cors });
  } catch (err) {
    console.error("[beurs] opslaan mislukt:", err);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500, headers: cors });
  }
}
