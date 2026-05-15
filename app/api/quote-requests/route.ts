import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { quoteRequests } from "@/lib/db/schema";

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
  locale: z.enum(["nl", "de", "en", "es"]).optional(),
});

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
    })
    .returning({ id: quoteRequests.id });

  return NextResponse.json({ ok: true, id: row.id }, { status: 201, headers: corsHeaders(origin) });
}
