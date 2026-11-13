/**
 * Video-adapter voor het wekelijkse videoslot (image-to-video via de
 * Higgsfield Model API, docs.higgsfield.ai):
 *  - POST https://api.higgsfield.ai/<endpoint-id>, header `Authorization: Key <id>:<secret>`
 *  - antwoord: { status: "queued", request_id, status_url, cancel_url }
 *  - status: GET status_url → status queued|in_progress|completed|failed|nsfw|canceled,
 *    video op `video.url` (blijft minstens 7 dagen staan; wij kopiëren hem naar Zernio)
 *
 * Standaardmodel Seedance 2.0 image-to-video, 720p, zonder AI-geluid (muziek
 * komt er later onder). Het formaat volgt het bronbeeld. Ander model kiezen kan
 * met HIGGSFIELD_I2V_PATH (bv. "/kling-video/v3.0/std/image-to-video").
 *
 * Sleutel: maak er een in console.higgsfield.ai en zet hem als
 * HIGGSFIELD_API_KEY="<key id>:<key secret>" in Vercel. Zonder sleutel krijgt
 * het videoslot "video nodig" en koppelt de eigenaar zelf een mp4.
 */
import "server-only";

const BASE_URL = "https://api.higgsfield.ai";

export interface VideoJob {
  requestId: string;
  statusUrl: string;
  submittedAt: string;
}

export type VideoJobState =
  | { state: "pending" }
  | { state: "done"; videoUrl: string }
  | { state: "failed"; error: string };

const DEFAULT_I2V_PATH = "/bytedance/seedance-2.0/image-to-video";

/** HIGGSFIELD_API_KEY = "<key id>:<key secret>". */
export function higgsfieldConfigured(): boolean {
  return /^[^:\s]+:[^:\s]+$/.test(process.env.HIGGSFIELD_API_KEY?.trim() ?? "");
}

function i2vPath(): string {
  const p = process.env.HIGGSFIELD_I2V_PATH?.trim();
  return p && /^\/[a-z0-9./_-]+$/i.test(p) ? p : DEFAULT_I2V_PATH;
}

function authHeader(): string {
  return `Key ${process.env.HIGGSFIELD_API_KEY?.trim()}`;
}

/** Body per model: alleen velden die dat model kent (Seedance weigert onbekende velden). */
function requestBody(path: string, imageUrl: string, prompt: string, seconds: number) {
  const duration = Math.min(15, Math.max(5, Math.round(seconds)));
  if (path.includes("seedance")) return { image_url: imageUrl, prompt, duration, resolution: "720p", generate_audio: false };
  if (path.includes("kling")) return { image_url: imageUrl, prompt, duration, sound: "off" };
  return { image_url: imageUrl, prompt, duration };
}

/** Video-URL uit het statusantwoord (`video.url`; de rest als vangnet). */
function extractVideoUrl(data: Record<string, unknown>): string | null {
  const candidates: unknown[] = [
    (data.video as { url?: unknown } | undefined)?.url,
    data.video_url,
    (Array.isArray(data.videos) ? (data.videos[0] as { url?: unknown } | undefined)?.url : undefined),
    (Array.isArray(data.outputs) ? (data.outputs[0] as { url?: unknown } | undefined)?.url : undefined),
  ];
  const url = candidates.find((c): c is string => typeof c === "string" && /^https:\/\//.test(c));
  return url ?? null;
}

export async function submitImageToVideo(imageUrl: string, prompt: string, seconds: number): Promise<VideoJob> {
  if (!higgsfieldConfigured()) throw new Error("Higgsfield is niet geconfigureerd.");
  const path = i2vPath();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { authorization: authHeader(), "content-type": "application/json" },
    body: JSON.stringify(requestBody(path, imageUrl, prompt, seconds)),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Higgsfield ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text) as { request_id?: string; status_url?: string };
  if (!data.request_id || !data.status_url) throw new Error("Higgsfield gaf geen request_id/status_url terug.");
  return { requestId: data.request_id, statusUrl: data.status_url, submittedAt: new Date().toISOString() };
}

export async function pollVideoJob(job: VideoJob): Promise<VideoJobState> {
  if (!higgsfieldConfigured()) return { state: "failed", error: "Higgsfield is niet geconfigureerd." };
  // Alleen de door Higgsfield zelf teruggegeven status-URL volgen, op hun eigen domein.
  if (!job.statusUrl.startsWith(`${BASE_URL}/`)) return { state: "failed", error: "Onverwachte status-URL." };
  const res = await fetch(job.statusUrl, { headers: { authorization: authHeader() }, cache: "no-store" });
  if (!res.ok) return { state: "failed", error: `Higgsfield status ${res.status}` };
  const data = (await res.json()) as Record<string, unknown>;
  const status = String(data.status ?? "").toLowerCase();
  if (["failed", "error", "nsfw", "cancelled", "canceled"].includes(status)) {
    const detail = typeof data.error === "string" && data.error ? ` — ${data.error.slice(0, 200)}` : "";
    return { state: "failed", error: `Higgsfield: ${status}${detail}` };
  }
  if (status !== "completed") return { state: "pending" };
  const url = extractVideoUrl(data);
  if (url) return { state: "done", videoUrl: url };
  return { state: "pending" };
}
