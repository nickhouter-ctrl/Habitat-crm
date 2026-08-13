"use server";

/**
 * Server actions voor de campagne-UI (brief §7).
 *
 * Planning gebeurt in Europe/Madrid (§9) en wordt hier omgerekend naar UTC;
 * Meta rekent in de tijdzone van het advertentie-account — de UI toont die
 * waarschuwing. Dagdelen vereisen een looptijdbudget: dezelfde validatie
 * (`validateAdSetScheduling`) die de publish-keten gebruikt, draait hier
 * vóór het opslaan zodat de cryptische Meta-fout nooit optreedt.
 */
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireWriteUser } from "@/lib/auth/guards";
import { ensureRenderForSpec } from "@/lib/creatives/export";
import { db } from "@/lib/db";
import { adCampaigns, adSets } from "@/lib/db/schema";
import { metaErrorMessage } from "@/lib/meta/client";
import { validateAdSetScheduling } from "@/lib/meta/publish";
import { syncMetaStatuses } from "@/lib/meta/sync";
import {
  buildDayparting,
  parseMadridLocal,
} from "@/components/marketing/campaigns/schedule";

export interface CampaignActionState {
  error?: string;
  errors?: string[];
}

/* ---------------------------------------------------------------- campagne */

const campaignSchema = z.object({
  name: z.string().trim().min(1, "Geef de campagne een naam.").max(200),
  objective: z.enum(["OUTCOME_TRAFFIC", "OUTCOME_LEADS", "OUTCOME_AWARENESS"]),
});

/** Maak een campagne-record aan (alleen in het CRM; Meta volgt bij publicatie). */
export async function createCampaign(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  await requireWriteUser();
  const parsed = campaignSchema.safeParse({
    name: formData.get("name"),
    objective: formData.get("objective"),
  });
  if (!parsed.success) {
    return { error: "Controleer naam en doelstelling.", errors: z.flattenError(parsed.error).formErrors };
  }
  const [row] = await db
    .insert(adCampaigns)
    .values(parsed.data)
    .returning({ id: adCampaigns.id });
  revalidatePath("/marketing/campaigns");
  redirect(`/marketing/campaigns/${row.id}`);
}

/* ----------------------------------------------------------- advertentieset */

const adSetSchema = z.object({
  campaignId: z.uuid(),
  adSetId: z.uuid().optional().or(z.literal("")),
  name: z.string().trim().min(1, "Geef de advertentieset een naam.").max(200),
  locale: z.enum(["nl", "en", "es", "de"]),
  audienceSegment: z.enum(["local_es", "expat_nl", "expat_en", "expat_de"], {
    error: "Kies de doelgroep-as (lokaal of expat) — daar leert de leerlaag langs (§8c).",
  }),
  budgetType: z.enum(["daily", "lifetime"]),
  budgetEur: z
    .string()
    .trim()
    .regex(/^\d+(?:[.,]\d{1,2})?$/, "Vul een bedrag in euro's in, bv. 25 of 25,50."),
  startTime: z.string().trim(),
  endTime: z.string().trim(),
  daypartDays: z.array(z.coerce.number().int().min(0).max(6)),
  daypartStart: z.coerce.number().int().min(0).max(23),
  daypartEnd: z.coerce.number().int().min(1).max(24),
  daypartEnabled: z.boolean(),
});

/** Maak of wijzig een advertentieset, met planningvalidatie vóór opslaan. */
export async function saveAdSet(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  await requireWriteUser();

  const parsed = adSetSchema.safeParse({
    campaignId: formData.get("campaignId"),
    adSetId: formData.get("adSetId") ?? "",
    name: formData.get("name"),
    locale: formData.get("locale"),
    audienceSegment: formData.get("audienceSegment"),
    budgetType: formData.get("budgetType"),
    budgetEur: formData.get("budgetEur"),
    startTime: formData.get("startTime") ?? "",
    endTime: formData.get("endTime") ?? "",
    daypartDays: formData.getAll("daypartDays"),
    daypartStart: formData.get("daypartStart") ?? 9,
    daypartEnd: formData.get("daypartEnd") ?? 21,
    daypartEnabled: formData.get("daypartEnabled") === "on",
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      error: "Controleer de gemarkeerde velden.",
      errors: [...flat.formErrors, ...Object.values(flat.fieldErrors).flat()],
    };
  }
  const v = parsed.data;

  const startTime = v.startTime ? parseMadridLocal(v.startTime) : null;
  const endTime = v.endTime ? parseMadridLocal(v.endTime) : null;
  if (v.startTime && !startTime) return { error: "De startdatum is onleesbaar." };
  if (v.endTime && !endTime) return { error: "De einddatum is onleesbaar." };

  const budget = v.budgetEur.replace(",", ".");
  const dayparting = v.daypartEnabled
    ? buildDayparting(v.daypartDays, v.daypartStart, v.daypartEnd)
    : null;
  if (v.daypartEnabled && !dayparting) {
    return { error: "Dagdelen: kies minstens één dag en een geldige tijdsrange (einde na begin)." };
  }

  // Dezelfde validatie als de publish-keten — de cryptische Meta-fout
  // ("dagdelen zonder lifetime-budget") kan zo nooit optreden (§7).
  const schedulingErrors = validateAdSetScheduling({
    startTime,
    endTime,
    dayparting,
    lifetimeBudgetEur: v.budgetType === "lifetime" ? budget : null,
    dailyBudgetEur: v.budgetType === "daily" ? budget : null,
  });
  if (schedulingErrors.length > 0) {
    return { error: "De planning klopt nog niet:", errors: schedulingErrors };
  }

  const values = {
    campaignId: v.campaignId,
    name: v.name,
    locale: v.locale,
    audienceSegment: v.audienceSegment,
    startTime,
    endTime,
    dailyBudgetEur: v.budgetType === "daily" ? budget : null,
    lifetimeBudgetEur: v.budgetType === "lifetime" ? budget : null,
    dayparting,
  };

  if (v.adSetId) {
    await db.update(adSets).set(values).where(eq(adSets.id, v.adSetId));
  } else {
    await db.insert(adSets).values(values);
  }
  revalidatePath(`/marketing/campaigns/${v.campaignId}`);
  redirect(`/marketing/campaigns/${v.campaignId}`);
}

/* ------------------------------------------------------------------- render */

/**
 * Zorg dat er een opgeslagen render voor de spec bestaat (nodig vóór
 * publicatie). Aangeroepen door de publicatie-flow in de UI.
 */
export async function prepareRenderAction(specId: string): Promise<{ error?: string }> {
  await requireWriteUser();
  const id = z.uuid().safeParse(specId);
  if (!id.success) return { error: "Ongeldige creative." };
  const result = await ensureRenderForSpec(id.data);
  return result.ok ? {} : { error: result.error };
}

/* --------------------------------------------------------------------- sync */

/** Handmatige statussync — de cron doet dit ook, dit is de "Nu verversen"-knop. */
export async function syncNowAction(): Promise<void> {
  await requireWriteUser();
  try {
    await syncMetaStatuses();
  } catch (err) {
    // Sync-fouten zijn zichtbaar doordat lastSyncedAt niet opschuift; log de rest.
    console.error("Handmatige Meta-sync mislukt:", metaErrorMessage(err));
  }
  revalidatePath("/marketing/campaigns");
}
