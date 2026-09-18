"use server";

import { randomBytes } from "node:crypto";
import { eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireModule } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { prospects } from "@/lib/db/schema";
import { searchPlaces, type PlaceCategory } from "@/lib/leads/places";
import { searchOverpass } from "@/lib/leads/overpass";

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireModule("leads");
}

function token() {
  return randomBytes(24).toString("base64url");
}

// ─── Bedrijven zoeken via Google Places + importeren als prospects ───────────
const searchSchema = z.object({
  source: z.enum(["osm", "places"]).default("osm"),
  category: z.enum([
    "architect",
    "aannemer",
    "makelaar",
    "interieur",
    "projectontwikkelaar",
    "hovenier",
    "overig",
  ]),
  region: z.string().trim().min(1).max(120),
  freeText: z.string().trim().max(160).optional().or(z.literal("")),
  radiusKm: z.coerce.number().min(0).max(50).optional(),
});

export async function searchAndImportProspects(formData: FormData) {
  await requireUser();
  const parsed = searchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/leads?error=zoekopdracht");
  const v = parsed.data;
  const useOsm = v.source === "osm";
  const onlyWithEmail = formData.get("onlyWithEmail") === "on";

  let found;
  try {
    const args = {
      category: v.category as PlaceCategory,
      region: v.region,
      freeText: v.freeText || undefined,
      radiusKm: v.radiusKm || undefined,
    };
    found = useOsm ? await searchOverpass(args) : await searchPlaces(args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "onbekende fout";
    redirect(`/leads?error=${encodeURIComponent(msg)}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const sourceLabel = useOsm ? "OpenStreetMap" : "Google Places";
  let added = 0;
  let skippedNoEmail = 0;
  for (const p of found) {
    if (onlyWithEmail && !p.email) {
      skippedNoEmail++;
      continue;
    }
    const [row] = await db
      .insert(prospects)
      .values({
        companyName: p.name,
        category: v.category,
        email: p.email ?? null,
        website: p.website ?? null,
        phone: p.phone ?? null,
        addressLine: p.address ?? null,
        source: useOsm ? "import" : "google-places",
        sourceRef: p.placeId,
        status: "new",
        lawfulBasisNote: `B2B gerechtvaardigd belang — via ${sourceLabel} (${v.category}) op ${today}, openbare bron`,
        unsubscribeToken: token(),
      })
      .onConflictDoNothing({ target: prospects.sourceRef })
      .returning({ id: prospects.id });
    if (row) added++;
  }
  revalidatePath("/leads");
  redirect(`/leads?added=${added}&found=${found.length}${skippedNoEmail ? `&noemail=${skippedNoEmail}` : ""}`);
}

/** Zoek alsnog e-mailadressen voor prospects zonder mail: heeft het bedrijf een
 *  website → scrapen; geen website → eerst de site opzoeken (DuckDuckGo), dan scrapen. */
export async function findMissingEmails(): Promise<{ ok: boolean; found: number; checked: number }> {
  await requireUser();
  const { extractEmailFromSite } = await import("@/lib/leads/places");
  const { findWebsite } = await import("@/lib/leads/websearch");
  const targets = await db.query.prospects.findMany({
    where: isNull(prospects.email),
    columns: { id: true, website: true, companyName: true, city: true },
    limit: 40,
  });
  let found = 0;
  for (const t of targets) {
    let website = t.website;
    if (!website) {
      website = await findWebsite(t.companyName, t.city ?? undefined);
      if (website) {
        await db.update(prospects).set({ website, updatedAt: sql`now()` }).where(eq(prospects.id, t.id)).catch(() => {});
      }
    }
    if (!website) continue;
    const email = await extractEmailFromSite(website);
    if (email) {
      await db
        .update(prospects)
        .set({ email, updatedAt: sql`now()` })
        .where(eq(prospects.id, t.id))
        .catch(() => {}); // uniek-conflict op e-mail → stil overslaan
      found++;
    }
  }
  revalidatePath("/leads");
  return { ok: true, found, checked: targets.length };
}

// De oude plak-CSV-import is weg. Die deed geen dedupe tegen contacten of de
// afmeldlijst, legde niet vast waar een lijst vandaan kwam, en schreef rij voor
// rij weg — bij 7.000 regels dus 7.000 losse queries. Het echte importpad staat
// in app/(app)/leads/import/.

export async function deleteProspect(id: string) {
  await requireUser();
  await db.delete(prospects).where(eq(prospects.id, id));
  revalidatePath("/leads");
}

