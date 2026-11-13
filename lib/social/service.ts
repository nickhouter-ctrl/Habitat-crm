/**
 * Social-media weekplanning — de database- en API-kant. De pure logica zit in
 * planner.ts / caption.ts / image-prep.ts; dit bestand verbindt die met de
 * bibliotheek (assets), Zernio, Higgsfield en de mail.
 *
 * Afspraak met de eigenaar: posts blijven CONCEPT tot er akkoord is. Alleen
 * `approvePost` plant iets in bij Zernio.
 */
import "server-only";

import { and, asc, desc, eq, inArray, isNotNull, isNull, not, sql } from "drizzle-orm";

import { agendaDateTime } from "@/lib/agenda-dates";
import { crmUrl } from "@/lib/crm-url";
import { db } from "@/lib/db";
import { assets, socialAssetUsage, socialPosts } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { marketingStorage } from "@/lib/marketing/storage";

import { fallbackCaption, generateCaption, reviseCaption, videoPrompt } from "./caption";
import { SOCIAL_TIME_ZONE, socialConfig } from "./config";
import { socialWeekEmail } from "./email";
import { higgsfieldConfigured, pollVideoJob, submitImageToVideo } from "./higgsfield";
import { brandVideo, prepareSocialImage, type SocialFormat } from "./image-prep";
import { madridDay, planWeek, shiftDate, type PlannerAsset } from "./planner";
import { createDraftPost, schedulePost, updateDraftPost, uploadMedia, zernioAccounts, zernioConfigured, type ZernioPostInput } from "./zernio";

export type SocialPostRow = typeof socialPosts.$inferSelect;

/** Publieke URL van een opgeslagen asset, of null als Storage niet is ingesteld (dev). */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  try {
    return marketingStorage().publicUrl(path);
  } catch {
    return null;
  }
}

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

/** Heeft de videopost nog geen video (en loopt er ook geen job)? */
export function needsVideo(post: Pick<SocialPostRow, "kind" | "videoUrl" | "videoAssetId">): boolean {
  return post.kind === "video" && !post.videoUrl && !post.videoAssetId;
}

/* ------------------------------------------------------------- bibliotheek */

/** Alle bruikbare beelden + wanneer ze voor het laatst in een social-post zaten. */
async function plannerAssets(): Promise<PlannerAsset[]> {
  const lastUse = db
    .select({ assetId: socialAssetUsage.assetId, lastUsedOn: sql<string>`max(${socialAssetUsage.usedOn})`.as("last_used_on") })
    .from(socialAssetUsage)
    .groupBy(socialAssetUsage.assetId)
    .as("last_use");
  const rows = await db
    .select({
      id: assets.id,
      name: assets.sourceRef,
      tags: assets.tags,
      source: assets.source,
      width: assets.width,
      height: assets.height,
      lastUsedOn: lastUse.lastUsedOn,
    })
    .from(assets)
    .leftJoin(lastUse, eq(lastUse.assetId, assets.id))
    .where(and(eq(assets.mediaType, "image"), not(sql`${assets.storagePath} like 'embed/%'`)));
  return rows;
}

/* --------------------------------------------------------------- plannen */

export interface BuildWeekResult {
  weekStart: string;
  created: number;
  posts: SocialPostRow[];
}

/**
 * Zet de posts voor een week klaar. Idempotent: alleen postdagen zonder post
 * worden aangevuld; is de week compleet, dan wordt er niets bijgemaakt (uniek op plannedDate vangt ook een
 * gelijktijdige tweede run af). Dagen in het verleden worden overgeslagen.
 */
export async function buildWeek(weekStart: string, now = new Date()): Promise<BuildWeekResult> {
  const config = socialConfig();
  const existing = await weekPosts(weekStart);
  const missing = missingPostDays(weekStart, existing.map((p) => p.plannedDate), now);
  if (!missing.length) return { weekStart, created: 0, posts: existing };

  const today = madridDay(now);
  const weekdays = config.weekdays.filter((d) => shiftDate(weekStart, d - 1) > today);
  // Plan de hele week (zelfde soortenverdeling als altijd) en houd alleen de
  // dagen over die nog geen post hebben — zo vult dit ook een gat op.
  const plan = planWeek({
    weekStart,
    weekdays,
    assets: await plannerAssets(),
    reuseAfterDays: config.reuseAfterDays,
    excludeKeywords: config.excludeKeywords,
  }).filter((p) => missing.includes(p.plannedDate));

  const createdIds = await db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const p of plan) {
      const [row] = await tx
        .insert(socialPosts)
        .values({
          weekStart,
          plannedDate: p.plannedDate,
          publishTime: config.publishTime,
          slot: p.slot,
          theme: p.theme,
          kind: p.kind,
          assetIds: p.assetIds,
          videoSourceAssetId: p.videoSourceAssetId,
          caption: "",
        })
        .onConflictDoNothing({ target: socialPosts.plannedDate })
        .returning({ id: socialPosts.id });
      if (!row) continue;
      ids.push(row.id);
      const used = [...p.assetIds, ...(p.videoSourceAssetId ? [p.videoSourceAssetId] : [])];
      if (used.length) {
        await tx
          .insert(socialAssetUsage)
          .values(used.map((assetId) => ({ assetId, postId: row.id, usedOn: p.plannedDate })))
          .onConflictDoNothing();
      }
    }
    return ids;
  });

  // Captions, video-jobs en Zernio-concepten per post; een fout blijft bij die post.
  for (const id of createdIds) await prepareDraft(id);
  return { weekStart, created: createdIds.length, posts: await weekPosts(weekStart) };
}

/** Postdagen van de week (nog in de toekomst) waarvoor nog geen post bestaat. */
export function missingPostDays(weekStart: string, existingDates: string[], now = new Date()): string[] {
  const today = madridDay(now);
  const have = new Set(existingDates);
  return socialConfig()
    .weekdays.map((d) => shiftDate(weekStart, d - 1))
    .filter((day) => day > today && !have.has(day));
}

export async function weekPosts(weekStart: string): Promise<SocialPostRow[]> {
  return db.select().from(socialPosts).where(eq(socialPosts.weekStart, weekStart)).orderBy(asc(socialPosts.plannedDate));
}

async function getPost(id: string): Promise<SocialPostRow> {
  const [row] = await db.select().from(socialPosts).where(eq(socialPosts.id, id)).limit(1);
  if (!row) throw new Error("Post niet gevonden.");
  return row;
}

async function assetRows(ids: string[]) {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: assets.id, storagePath: assets.storagePath, name: assets.sourceRef, mediaType: assets.mediaType })
    .from(assets)
    .where(inArray(assets.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
}

/** Beelden die bij de caption horen (bij video: het bronbeeld). */
async function captionImages(post: SocialPostRow) {
  const ids = post.kind === "video" ? (post.videoSourceAssetId ? [post.videoSourceAssetId] : []) : post.assetIds;
  return assetRows(ids);
}

async function makeCaption(post: SocialPostRow): Promise<string> {
  const images = await captionImages(post);
  const ai = await generateCaption({
    kind: post.kind,
    theme: post.theme,
    imageUrls: images.map((i) => assetUrl(i.storagePath)).filter((u): u is string => Boolean(u)),
    imageNames: images.map((i) => i.name ?? "").filter(Boolean),
  });
  return ai ?? fallbackCaption(post.theme, post.kind);
}

/** Caption, video-job en Zernio-concept voor één post. Fouten → post.error. */
export async function prepareDraft(id: string): Promise<void> {
  let post = await getPost(id);
  const errors: string[] = [];
  try {
    if (!post.caption.trim()) {
      const caption = await makeCaption(post);
      [post] = await db.update(socialPosts).set({ caption }).where(eq(socialPosts.id, id)).returning();
    }
  } catch (err) {
    errors.push(`Caption: ${errorText(err)}`);
  }

  if (post.kind === "video" && needsVideo(post) && !post.videoJob && higgsfieldConfigured() && post.videoSourceAssetId) {
    try {
      const [source] = await assetRows([post.videoSourceAssetId]);
      const imageUrl = assetUrl(source?.storagePath);
      if (!imageUrl) throw new Error("Bronbeeld heeft geen publieke URL.");
      const prompt = videoPrompt(post.theme);
      const job = await submitImageToVideo(imageUrl, prompt, socialConfig().videoSeconds);
      [post] = await db
        .update(socialPosts)
        .set({ videoJob: job, videoPrompt: prompt, aiGenerated: true })
        .where(eq(socialPosts.id, id))
        .returning();
    } catch (err) {
      errors.push(`Video: ${errorText(err)}`);
    }
  } else if (post.kind === "video" && !post.videoPrompt) {
    [post] = await db.update(socialPosts).set({ videoPrompt: videoPrompt(post.theme) }).where(eq(socialPosts.id, id)).returning();
  }

  try {
    await syncZernioDraft(post);
  } catch (err) {
    errors.push(`Zernio: ${errorText(err)}`);
  }
  await db.update(socialPosts).set({ error: errors.length ? errors.join(" · ") : null }).where(eq(socialPosts.id, id));
}

/* ----------------------------------------------------------------- media */

function formatFor(post: SocialPostRow): SocialFormat {
  return post.kind === "single" ? "square" : "portrait";
}

/** Beelden bijsnijden + merk erop + naar Zernio; video ophalen + naar Zernio. Gecachet op de post. */
async function ensureZernioMedia(post: SocialPostRow): Promise<{ urls: string[]; mediaType: "image" | "video" } | null> {
  const mediaType = post.kind === "video" ? "video" : "image";
  if (post.zernioMediaUrls?.length) return { urls: post.zernioMediaUrls, mediaType };

  let urls: string[] = [];
  if (post.kind === "video") {
    let source = post.videoUrl;
    if (!source && post.videoAssetId) source = assetUrl((await assetRows([post.videoAssetId]))[0]?.storagePath);
    if (!source) return null;
    const res = await fetch(source, { cache: "no-store" });
    if (!res.ok) throw new Error(`Video ophalen mislukt (${res.status}).`);
    const bytes = await brandVideo(new Uint8Array(await res.arrayBuffer()));
    urls = [await uploadMedia(bytes, `habitat-${post.plannedDate}.mp4`, "video/mp4")];
  } else {
    const images = await assetRows(post.assetIds);
    if (!images.length) return null;
    for (const [i, img] of images.entries()) {
      const url = assetUrl(img.storagePath);
      if (!url) throw new Error("Beeld heeft geen publieke URL (Storage niet ingesteld?).");
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Beeld ophalen mislukt (${res.status}).`);
      const prepared = await prepareSocialImage(new Uint8Array(await res.arrayBuffer()), formatFor(post));
      urls.push(await uploadMedia(prepared, `habitat-${post.plannedDate}-${i + 1}.jpg`, "image/jpeg"));
    }
  }
  await db.update(socialPosts).set({ zernioMediaUrls: urls }).where(eq(socialPosts.id, post.id));
  return { urls, mediaType };
}

function zernioInput(post: SocialPostRow, media: { urls: string[]; mediaType: "image" | "video" }): ZernioPostInput {
  return { content: post.caption, mediaUrls: media.urls, mediaType: media.mediaType, aiGenerated: post.aiGenerated };
}

/** Zet de post als CONCEPT in Zernio (of werk het concept bij). Stil overslaan zonder config of media. */
export async function syncZernioDraft(post: SocialPostRow): Promise<void> {
  if (!zernioConfigured() || !post.caption.trim()) return;
  if (!["draft", "failed", "approved"].includes(post.status)) return;
  const media = await ensureZernioMedia(post);
  if (!media) return;
  const input = zernioInput(post, media);
  if (post.zernioPostId) {
    await updateDraftPost(post.zernioPostId, input);
  } else {
    const zernioPostId = await createDraftPost(input, `habitat-social-${post.id}`);
    await db
      .update(socialPosts)
      .set({ zernioPostId, zernioAccounts: zernioAccounts() as Record<string, string> })
      .where(eq(socialPosts.id, post.id));
  }
}

/* ------------------------------------------------------------- acties */

const EDITABLE = ["draft", "failed", "approved"] as const;

function assertEditable(post: SocialPostRow) {
  if (!(EDITABLE as readonly string[]).includes(post.status)) {
    throw new Error("Deze post is al ingepland of afgewezen en kan niet meer worden gewijzigd.");
  }
}

/** Akkoord → inplannen in Zernio op de geplande dag en tijd (Madrid). */
export async function approvePost(id: string, userId: string): Promise<SocialPostRow> {
  let post = await getPost(id);
  if (post.status === "scheduled" || post.status === "published") return post;
  assertEditable(post);
  if (!post.caption.trim()) throw new Error("De caption is leeg.");
  if (needsVideo(post)) throw new Error("Deze videopost heeft nog geen video.");
  const at = agendaDateTime(post.plannedDate, post.publishTime);
  if (!at) throw new Error("Ongeldige datum of tijd.");
  if (at.getTime() < Date.now() + 5 * 60_000) throw new Error("Het publicatiemoment ligt in het verleden; pas de tijd aan.");

  [post] = await db
    .update(socialPosts)
    .set({ status: "approved", approvedBy: userId, approvedAt: new Date(), error: null })
    .where(eq(socialPosts.id, id))
    .returning();

  if (!zernioConfigured()) {
    await db.update(socialPosts).set({ error: "Zernio is niet geconfigureerd — akkoord bewaard, nog niet ingepland." }).where(eq(socialPosts.id, id));
    return getPost(id);
  }
  try {
    await syncZernioDraft(post);
    post = await getPost(id);
    const media = await ensureZernioMedia(post);
    if (!media || !post.zernioPostId) throw new Error("Geen media of concept in Zernio.");
    await schedulePost(post.zernioPostId, {
      ...zernioInput(post, media),
      scheduledFor: `${post.plannedDate}T${post.publishTime}:00`,
      timezone: SOCIAL_TIME_ZONE,
    });
    await db.update(socialPosts).set({ status: "scheduled", scheduledFor: at, error: null }).where(eq(socialPosts.id, id));
  } catch (err) {
    await db.update(socialPosts).set({ status: "failed", error: errorText(err) }).where(eq(socialPosts.id, id));
  }
  return getPost(id);
}

/** Afwijzen: gaat niet online, en de beelden komen weer vrij voor de planner. */
export async function rejectPost(id: string): Promise<void> {
  const post = await getPost(id);
  if (post.status === "scheduled" || post.status === "published") {
    throw new Error("Deze post staat al ingepland in Zernio; haal hem daar weg.");
  }
  await db.transaction(async (tx) => {
    await tx.update(socialPosts).set({ status: "rejected" }).where(eq(socialPosts.id, id));
    await tx.delete(socialAssetUsage).where(eq(socialAssetUsage.postId, id));
  });
}

/** Terughalen van een afgewezen post naar concept. */
export async function reopenPost(id: string): Promise<void> {
  const post = await getPost(id);
  if (post.status !== "rejected") return;
  await db.transaction(async (tx) => {
    await tx.update(socialPosts).set({ status: "draft" }).where(eq(socialPosts.id, id));
    const used = [...post.assetIds, ...(post.videoSourceAssetId ? [post.videoSourceAssetId] : [])];
    if (used.length) {
      await tx
        .insert(socialAssetUsage)
        .values(used.map((assetId) => ({ assetId, postId: id, usedOn: post.plannedDate })))
        .onConflictDoNothing();
    }
  });
}

export async function regenerateCaption(id: string): Promise<void> {
  const post = await getPost(id);
  assertEditable(post);
  const caption = await makeCaption(post);
  const [updated] = await db.update(socialPosts).set({ caption, status: "draft" }).where(eq(socialPosts.id, id)).returning();
  await syncZernioDraft(updated).catch(async (err) => {
    await db.update(socialPosts).set({ error: `Zernio: ${errorText(err)}` }).where(eq(socialPosts.id, id));
  });
}

/** Aanpassing doorgeven: de AI herschrijft de caption volgens de aanwijzing. */
export async function reviseCaptionWithInstruction(id: string, instruction: string): Promise<void> {
  const post = await getPost(id);
  assertEditable(post);
  const caption = await reviseCaption(post.caption, instruction);
  if (!caption) throw new Error("De AI kon de tekst nu niet aanpassen; probeer het opnieuw of pas hem zelf aan.");
  const [updated] = await db.update(socialPosts).set({ caption, status: "draft" }).where(eq(socialPosts.id, id)).returning();
  await syncZernioDraft(updated).catch(async (err) => {
    await db.update(socialPosts).set({ error: `Zernio: ${errorText(err)}` }).where(eq(socialPosts.id, id));
  });
}

export async function saveCaption(id: string, caption: string, publishTime: string): Promise<void> {
  const post = await getPost(id);
  assertEditable(post);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(publishTime)) throw new Error("Tijd moet als UU:MM.");
  const [updated] = await db
    .update(socialPosts)
    .set({ caption: caption.trim(), publishTime, status: "draft" })
    .where(eq(socialPosts.id, id))
    .returning();
  await syncZernioDraft(updated).catch(async (err) => {
    await db.update(socialPosts).set({ error: `Zernio: ${errorText(err)}` }).where(eq(socialPosts.id, id));
  });
}

/** Koppel een video: een video uit de bibliotheek óf een publieke https-mp4-URL. */
export async function attachVideo(id: string, input: { assetId?: string | null; url?: string | null; aiGenerated: boolean }): Promise<void> {
  const post = await getPost(id);
  assertEditable(post);
  if (post.kind !== "video") throw new Error("Alleen videoposts krijgen een video.");
  let videoAssetId: string | null = null;
  let videoUrl: string | null = null;
  if (input.assetId) {
    const [row] = await assetRows([input.assetId]);
    if (!row || row.mediaType !== "video") throw new Error("Kies een video uit de bibliotheek.");
    videoAssetId = row.id;
  } else if (input.url) {
    if (!/^https:\/\/\S+$/i.test(input.url)) throw new Error("De video-URL moet met https:// beginnen.");
    videoUrl = input.url;
  } else {
    throw new Error("Kies een video of plak een URL.");
  }
  const [updated] = await db
    .update(socialPosts)
    .set({ videoAssetId, videoUrl, videoJob: null, aiGenerated: input.aiGenerated, zernioMediaUrls: null, status: "draft", error: null })
    .where(eq(socialPosts.id, id))
    .returning();
  await syncZernioDraft(updated).catch(async (err) => {
    await db.update(socialPosts).set({ error: `Zernio: ${errorText(err)}` }).where(eq(socialPosts.id, id));
  });
}

/** Lopende video-jobs nalopen; klaar → video op de post en concept bijwerken. */
export async function pollVideoJobs(): Promise<number> {
  const pending = await db
    .select()
    .from(socialPosts)
    .where(and(isNotNull(socialPosts.videoJob), isNull(socialPosts.videoUrl), isNull(socialPosts.videoAssetId)));
  let done = 0;
  for (const post of pending) {
    if (!post.videoJob) continue;
    const state = await pollVideoJob(post.videoJob);
    if (state.state === "pending") continue;
    if (state.state === "failed") {
      await db.update(socialPosts).set({ videoJob: null, error: state.error }).where(eq(socialPosts.id, post.id));
      continue;
    }
    const [updated] = await db
      .update(socialPosts)
      .set({ videoUrl: state.videoUrl, videoJob: null, zernioMediaUrls: null, error: null })
      .where(eq(socialPosts.id, post.id))
      .returning();
    done++;
    await syncZernioDraft(updated).catch(async (err) => {
      await db.update(socialPosts).set({ error: `Zernio: ${errorText(err)}` }).where(eq(socialPosts.id, post.id));
    });
  }
  return done;
}

/* -------------------------------------------------------------------- mail */

/** Mail de eigenaar over posts van deze week die nog niet gemeld zijn. Idempotent via notifiedAt. */
export async function sendWeekEmail(weekStart: string): Promise<{ sent: boolean; count: number }> {
  const posts = (await weekPosts(weekStart)).filter((p) => p.status !== "rejected");
  if (!posts.length || posts.every((p) => p.notifiedAt)) return { sent: false, count: 0 };

  const thumbIds = [...new Set(posts.flatMap((p) => [...p.assetIds, ...(p.videoSourceAssetId ? [p.videoSourceAssetId] : [])]))];
  const thumbs = new Map((await assetRows(thumbIds)).map((a) => [a.id, assetUrl(a.storagePath)]));
  const mail = socialWeekEmail({
    weekStart,
    reviewUrl: `${crmUrl()}/marketing/social?week=${weekStart}`,
    posts: posts.map((p) => ({
      plannedDate: p.plannedDate,
      publishTime: p.publishTime,
      kind: p.kind,
      theme: p.theme,
      caption: p.caption,
      thumbnails: (p.kind === "video" ? [p.videoSourceAssetId] : p.assetIds)
        .map((id) => (id ? thumbs.get(id) : null))
        .filter((u): u is string => Boolean(u)),
      needsVideo: needsVideo(p) && !p.videoJob,
      error: p.error,
    })),
  });
  const res = await sendEmail({ to: socialConfig().ownerEmail, subject: mail.subject, html: mail.html, text: mail.text, interneMelding: true });
  if (res.sent) {
    await db.update(socialPosts).set({ notifiedAt: new Date() }).where(inArray(socialPosts.id, posts.map((p) => p.id)));
  }
  return { sent: res.sent, count: posts.length };
}

/** Video's uit de bibliotheek om aan een videopost te koppelen (nieuwste eerst). */
export async function recentVideoAssets(limit = 40) {
  const rows = await db
    .select({ id: assets.id, name: assets.sourceRef, storagePath: assets.storagePath, createdAt: assets.createdAt })
    .from(assets)
    .where(and(eq(assets.mediaType, "video"), not(sql`${assets.storagePath} like 'embed/%'`)))
    .orderBy(desc(assets.createdAt))
    .limit(limit);
  return rows;
}

/** Miniatuur-URL's per asset-id (voor de reviewpagina). */
export async function assetPreviews(ids: string[]): Promise<Map<string, { url: string | null; name: string | null; mediaType: string }>> {
  const rows = await assetRows([...new Set(ids)]);
  return new Map(rows.map((r) => [r.id, { url: assetUrl(r.storagePath), name: r.name, mediaType: r.mediaType }]));
}

