"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { normalizeStartPrefs, type StartPrefs } from "@/lib/start-tegels";

/**
 * Persoonlijke tegel-indeling opslaan. Bewust géén requireWriteUser: dit raakt
 * alleen de eigen users-rij, dus ook een viewer mag zijn startpagina indelen.
 * `null` = terug naar de standaardindeling.
 */
export async function saveStartPrefs(prefs: StartPrefs | null) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Niet ingelogd.");
  await db
    .update(users)
    .set({ startPrefs: prefs === null ? null : normalizeStartPrefs(prefs), updatedAt: new Date() })
    .where(eq(users.id, session.user.id));
  revalidatePath("/");
}
