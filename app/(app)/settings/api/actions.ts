"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { newApiKey } from "@/lib/api-keys";

export type KeyState = { key?: string; error?: string } | null;
/** Nieuwe sleutel: de sleutel zelf komt één keer terug en wordt nergens bewaard. */
export async function createApiKey(_prev: KeyState, form: FormData): Promise<KeyState> {
  const admin = await requireAdmin();
  const name = z.string().trim().min(2).max(80).safeParse(form.get("name"));
  if (!name.success) return { error: "Geef de sleutel een naam (bijv. de naam van de ontwikkelaar)." };
  const write = form.get("write") === "on";
  const { key, hash, prefix } = newApiKey();
  await db.insert(apiKeys).values({ name: name.data, keyHash: hash, prefix, scopes: write ? ["content:read", "content:write"] : ["content:read"], createdBy: admin.id });
  revalidatePath("/settings/api");
  return { key };
}
export async function revokeApiKey(id: string) {
  await requireAdmin();
  await db.update(apiKeys).set({ revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(apiKeys.id, z.uuid().parse(id)), isNull(apiKeys.revokedAt)));
  revalidatePath("/settings/api");
}
