/**
 * Download een mail-bijlage. Vereist auth. Genereert signed URL + redirect.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { mailAttachments } from "@/lib/db/schema";
import { signAttachmentUrl } from "@/lib/email-attachments";
import { weigerRoute } from "@/lib/auth/guards";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const nee = await weigerRoute("inbox");
  if (nee) return nee;

  const { id } = await params;
  const att = await db.query.mailAttachments.findFirst({ where: eq(mailAttachments.id, id) });
  if (!att) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = await signAttachmentUrl(att.storagePath);
  return NextResponse.redirect(url);
}
