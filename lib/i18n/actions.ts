"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { huidigeToegangOfNull } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isLocale, TAAL_COOKIE } from "@/lib/i18n";

/**
 * Taal kiezen. Zet altijd het cookie — dat is wat het inlogscherm leest, want
 * daar is nog geen gebruiker — en werkt bij een ingelogde medewerker ook zijn
 * eigen instelling bij, zodat de keuze op een andere computer meegaat.
 */
export async function zetTaal(locale: string) {
  if (!isLocale(locale)) return;

  const jar = await cookies();
  jar.set(TAAL_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });

  const ik = await huidigeToegangOfNull();
  if (ik) await db.update(users).set({ locale }).where(eq(users.id, ik.id));

  // De hele app hangt aan de taal: layout, menu en elke pagina.
  revalidatePath("/", "layout");
}
