"use server";

/**
 * Server actions voor het concurrentendashboard: concurrenten toevoegen en
 * verwijderen. Mutaties via requireWriteUser (viewer = alleen-lezen).
 */
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWriteUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { competitorAds, competitors } from "@/lib/db/schema";

const competitorSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht.").max(120),
  // Meta Page-ID's zijn numeriek; uit de view_all_page_id-parameter in de
  // Ad Library-URL (brief §8b).
  metaPageId: z.string().trim().regex(/^\d{3,20}$/, "Page-ID moet een getal zijn (uit de Ad Library-URL, parameter view_all_page_id)."),
  website: z.union([z.literal(""), z.url("Website moet een volledige URL zijn (https://…).")]),
  segment: z.enum(["materials", "contractor", "architect", "estate_agent"]).nullable(),
  notes: z.string().trim().max(2000),
});

/** Voeg een concurrent toe. Geeft een NL-foutzin terug of null bij succes. */
export async function addCompetitor(formData: FormData): Promise<string | null> {
  await requireWriteUser();
  const parsed = competitorSchema.safeParse({
    name: formData.get("name") ?? "",
    metaPageId: formData.get("metaPageId") ?? "",
    website: ((formData.get("website") as string) ?? "").trim(),
    segment: (formData.get("segment") as string) || null,
    notes: (formData.get("notes") as string) ?? "",
  });
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Ongeldige invoer.";
  }
  try {
    await db.insert(competitors).values({
      name: parsed.data.name,
      metaPageId: parsed.data.metaPageId,
      website: parsed.data.website || null,
      segment: parsed.data.segment,
      notes: parsed.data.notes || null,
    });
  } catch (err) {
    // Unieke index op meta_page_id — dubbel toevoegen netjes melden.
    if (err instanceof Error && /duplicate|unique/i.test(err.message)) {
      return "Deze pagina wordt al gevolgd.";
    }
    throw err;
  }
  revalidatePath("/marketing/competitors");
  return null;
}

/** Stop met volgen; de opgehaalde advertentiehistorie wordt mee verwijderd. */
export async function removeCompetitor(formData: FormData): Promise<void> {
  await requireWriteUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  // Soft links zonder FK-cascade: eerst de advertentiehistorie, dan de rij.
  await db.delete(competitorAds).where(eq(competitorAds.competitorId, id.data));
  await db.delete(competitors).where(eq(competitors.id, id.data));
  revalidatePath("/marketing/competitors");
}
