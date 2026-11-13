/**
 * Zernio-client (social scheduling, https://docs.zernio.com) — de ENIGE plek
 * die de Zernio-API kent. Klopt er een veld niet, dan hoeft alleen dit
 * bestand aangepast.
 *
 * Geverifieerd in de docs (13-11-2026):
 *  - POST /v1/media/presign {filename, contentType} → {uploadUrl, publicUrl}; PUT bytes naar uploadUrl
 *  - GET  /v1/accounts
 *  - POST /v1/posts  {content, mediaItems[{type,url}], platforms[{platform, accountId,
 *    platformSpecificData?}], isDraft, scheduledFor, timezone}; antwoord {post: {_id}}.
 *    Header `Idempotency-Key` (24 u): een herhaling geeft de oorspronkelijke post terug.
 *  - PUT  /v1/posts/{postId}: concept → ingepland met {isDraft:false, scheduledFor, platforms}
 *    ("When promoting the draft via PUT, send platforms, isDraft false and scheduledFor again").
 *    Zonder `isDraft` blijft een concept een concept (handig voor tekstwijzigingen).
 *  - Instagram platformSpecificData.isAiGenerated (boolean): label "AI-gegenereerd" voor
 *    AI-beeld/video (niet voor AI-tekst).
 *
 * NIET geverifieerd (TODO):
 *  - Facebook-specifieke velden voor Reels (de pagina /platforms/facebook/fields gaf 404);
 *    video gaat nu als gewone video naar Facebook.
 *  - Of een video-only post op Instagram automatisch als Reel gaat (de docs noemen
 *    `contentType` alleen voor "story"; we sturen dus niets extra's).
 *  - Verwijder-endpoint voor concepten: afgewezen posts blijven als concept in Zernio
 *    staan (concepten worden nooit gepubliceerd).
 */
import "server-only";

const BASE_URL = (process.env.ZERNIO_BASE_URL ?? "https://zernio.com/api").replace(/\/$/, "");

export type ZernioPlatform = "instagram" | "facebook";

export function zernioAccounts(): Partial<Record<ZernioPlatform, string>> {
  const out: Partial<Record<ZernioPlatform, string>> = {};
  if (process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID) out.instagram = process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID;
  if (process.env.ZERNIO_FACEBOOK_ACCOUNT_ID) out.facebook = process.env.ZERNIO_FACEBOOK_ACCOUNT_ID;
  return out;
}

export function zernioConfigured(): boolean {
  return Boolean(process.env.ZERNIO_API_KEY) && Object.keys(zernioAccounts()).length > 0;
}

export class ZernioError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) throw new ZernioError("ZERNIO_API_KEY ontbreekt.");
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new ZernioError(`Zernio ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`, res.status);
  return (text ? JSON.parse(text) : {}) as T;
}

/** Upload bytes via een presigned URL; geeft de publieke HTTPS-URL terug. */
export async function uploadMedia(bytes: Uint8Array, filename: string, contentType: string): Promise<string> {
  const { uploadUrl, publicUrl } = await call<{ uploadUrl: string; publicUrl: string }>("POST", "/v1/media/presign", {
    filename,
    contentType,
  });
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": contentType }, body: Buffer.from(bytes) });
  if (!put.ok) throw new ZernioError(`Upload naar Zernio mislukt (${put.status}).`, put.status);
  return publicUrl;
}

export interface ZernioPostInput {
  content: string;
  mediaUrls: string[];
  mediaType: "image" | "video";
  /** Instagram-label voor AI-gegenereerd beeld/video. */
  aiGenerated?: boolean;
}

function platformsFor(input: Pick<ZernioPostInput, "aiGenerated">) {
  return Object.entries(zernioAccounts()).map(([platform, accountId]) => ({
    platform,
    accountId,
    ...(platform === "instagram" && input.aiGenerated ? { platformSpecificData: { isAiGenerated: true } } : {}),
  }));
}

function mediaItems(input: Pick<ZernioPostInput, "mediaUrls" | "mediaType">) {
  return input.mediaUrls.map((url) => ({ type: input.mediaType, url }));
}

/** Maak een CONCEPT (gaat nooit vanzelf online). `idempotencyKey` = ons post-id. */
export async function createDraftPost(input: ZernioPostInput, idempotencyKey: string): Promise<string> {
  const res = await call<{ post?: { _id?: string } }>(
    "POST",
    "/v1/posts",
    { content: input.content, mediaItems: mediaItems(input), platforms: platformsFor(input), isDraft: true },
    { "Idempotency-Key": idempotencyKey },
  );
  const id = res.post?._id;
  if (!id) throw new ZernioError("Zernio gaf geen post-id terug.");
  return id;
}

/** Werk tekst/media van een concept bij; de conceptstatus blijft (isDraft weggelaten). */
export async function updateDraftPost(postId: string, input: ZernioPostInput): Promise<void> {
  await call("PUT", `/v1/posts/${encodeURIComponent(postId)}`, {
    content: input.content,
    mediaItems: mediaItems(input),
    platforms: platformsFor(input),
  });
}

/**
 * Concept → ingepland. `scheduledFor` zonder offset ("2026-11-16T19:00:00")
 * wordt door Zernio in `timezone` gelezen.
 */
export async function schedulePost(
  postId: string,
  input: ZernioPostInput & { scheduledFor: string; timezone: string },
): Promise<void> {
  await call("PUT", `/v1/posts/${encodeURIComponent(postId)}`, {
    content: input.content,
    mediaItems: mediaItems(input),
    platforms: platformsFor(input),
    isDraft: false,
    scheduledFor: input.scheduledFor,
    timezone: input.timezone,
  });
}
