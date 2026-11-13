"use server";

/**
 * Server actions voor de social-reviewpagina. Elke actie via
 * requireModule("advertenties") — dezelfde rollen als de rest van /marketing.
 * Geven een NL-foutzin terug, of null bij succes.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireModule } from "@/lib/auth/guards";
import { isoWeekday } from "@/lib/social/planner";
import {
  approvePost,
  attachVideo,
  buildWeek,
  changePhotos,
  pollVideoJobs,
  regenerateCaption,
  rejectPost,
  reopenPost,
  reviseCaptionWithInstruction,
  saveCaption,
  weekPosts,
} from "@/lib/social/service";

const PATH = "/marketing/social";
const id = z.uuid();

async function run(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Er ging iets mis.";
  } finally {
    revalidatePath(PATH);
  }
}

export async function approvePostAction(postId: string): Promise<string | null> {
  const user = await requireModule("advertenties");
  return run(async () => {
    const post = await approvePost(id.parse(postId), user.id);
    if (post.status === "failed" || post.error) throw new Error(post.error ?? "Inplannen mislukt.");
  });
}

/** Alle concepten van de week goedkeuren die klaar zijn (video's zonder video blijven staan). */
export async function approveWeekAction(weekStart: string): Promise<string | null> {
  const user = await requireModule("advertenties");
  return run(async () => {
    const errors: string[] = [];
    for (const post of await weekPosts(weekStart)) {
      if (!["draft", "failed", "approved"].includes(post.status)) continue;
      try {
        const res = await approvePost(post.id, user.id);
        if (res.error) errors.push(`${post.plannedDate}: ${res.error}`);
      } catch (err) {
        errors.push(`${post.plannedDate}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (errors.length) throw new Error(errors.join(" · "));
  });
}

export async function rejectPostAction(postId: string): Promise<string | null> {
  await requireModule("advertenties");
  return run(() => rejectPost(id.parse(postId)));
}

export async function reopenPostAction(postId: string): Promise<string | null> {
  await requireModule("advertenties");
  return run(() => reopenPost(id.parse(postId)));
}

export async function regenerateCaptionAction(postId: string): Promise<string | null> {
  await requireModule("advertenties");
  return run(() => regenerateCaption(id.parse(postId)));
}

export async function reviseCaptionAction(postId: string, instruction: string): Promise<string | null> {
  await requireModule("advertenties");
  const parsed = z.string().trim().min(2, "Schrijf wat er anders moet.").max(500, "Houd de aanwijzing kort (max 500 tekens).").safeParse(instruction);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Ongeldige invoer.";
  return run(() => reviseCaptionWithInstruction(id.parse(postId), parsed.data));
}

/** Andere foto's voor deze post (zelfde aantal, andere beelden, verse tekst). */
export async function swapPhotosAction(postId: string): Promise<string | null> {
  await requireModule("advertenties");
  return run(() => changePhotos(id.parse(postId), { photos: "replace", count: null, theme: null, captionInstruction: null }));
}

export async function saveCaptionAction(postId: string, caption: string, publishTime: string): Promise<string | null> {
  await requireModule("advertenties");
  const parsed = z.object({ caption: z.string().trim().min(1, "De caption is leeg.").max(2200, "Instagram staat maximaal 2200 tekens toe."), publishTime: z.string() }).safeParse({ caption, publishTime });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Ongeldige invoer.";
  return run(() => saveCaption(id.parse(postId), parsed.data.caption, parsed.data.publishTime));
}

export async function attachVideoAction(formData: FormData): Promise<string | null> {
  await requireModule("advertenties");
  const postId = id.safeParse(formData.get("postId"));
  if (!postId.success) return "Ongeldige post.";
  const assetId = String(formData.get("assetId") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  return run(() =>
    attachVideo(postId.data, {
      assetId: assetId ? id.parse(assetId) : null,
      url: url || null,
      aiGenerated: formData.get("aiGenerated") === "on",
    }),
  );
}

/** Week (alsnog) laten plannen — dezelfde idempotente route als de cron. */
export async function planWeekAction(weekStart: string): Promise<string | null> {
  await requireModule("advertenties");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || isoWeekday(weekStart) !== 1) return "Ongeldige week.";
  return run(() => buildWeek(weekStart));
}

export async function pollVideosAction(): Promise<string | null> {
  await requireModule("advertenties");
  return run(() => pollVideoJobs());
}
