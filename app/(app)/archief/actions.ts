"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireWriteUser } from "@/lib/auth/guards";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { mailAttachments } from "@/lib/db/schema";

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireWriteUser();
}

export async function updateAttachmentCategory(args: {
  id: string;
  category: string;
  supplierTag?: string;
}) {
  await requireUser();
  await db
    .update(mailAttachments)
    .set({
      category: args.category,
      supplierTag: args.supplierTag ?? null,
      updatedAt: new Date(),
    })
    .where(eq(mailAttachments.id, args.id));
  revalidatePath("/archief");
}
