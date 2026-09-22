"use server";

/**
 * Nabellen na een campagne: één belpoging vastleggen.
 *
 * De uitkomst gaat naar `prospect_calls` (historie, want nabellen kost vaak
 * twee of drie pogingen) en werkt waar het kan de prospectstatus bij: wie
 * interesse heeft of een afspraak maakt, is geen koude lijstregel meer.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireModule } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { prospectCalls, prospects } from "@/lib/db/schema";

const UITKOMSTEN = ["geen-antwoord", "terugbellen", "interesse", "afspraak", "geen-interesse", "verkeerd-nummer"] as const;
type Uitkomst = (typeof UITKOMSTEN)[number];

export async function legBelpogingVast(formData: FormData): Promise<void> {
  const user = await requireModule("broadcast");
  const prospectId = String(formData.get("prospectId") ?? "");
  const uitkomst = String(formData.get("outcome") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!prospectId || !UITKOMSTEN.includes(uitkomst as Uitkomst)) return;

  await db.insert(prospectCalls).values({
    prospectId,
    outcome: uitkomst as Uitkomst,
    note: note || null,
    userId: user.id,
  });

  // Alleen de statussen die echt iets zeggen; "geen antwoord" laat de prospect
  // gewoon op gemaild staan, zodat hij in de nabellijst blijft.
  const nieuweStatus =
    uitkomst === "interesse" || uitkomst === "afspraak"
      ? "replied"
      : uitkomst === "geen-interesse" || uitkomst === "verkeerd-nummer"
        ? "skipped"
        : null;
  if (nieuweStatus) {
    await db.update(prospects).set({ status: nieuweStatus, updatedAt: new Date() }).where(eq(prospects.id, prospectId));
  }

  revalidatePath("/broadcast/nabellen");
}
