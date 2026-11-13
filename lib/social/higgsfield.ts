/**
 * Video-adapter voor het wekelijkse videoslot (image-to-video, Higgsfield,
 * model kling3_0, 9:16, stil, modus pro).
 *
 * Wat in de docs (docs.higgsfield.ai) te verifiëren was:
 *  - basis-URL https://api.higgsfield.ai, paden per model als /{provider}/{model}/…
 *  - auth-header `Authorization: Key {API_KEY_ID}:{API_KEY_SECRET}`
 *  - een aanvraag geeft `request_id` + `status_url` terug; status opvragen via die URL
 *
 * NIET te verifiëren (TODO — invullen zodra de Kling-pagina van de Model API
 * Reference bekend is):
 *  - het pad voor kling3_0 image-to-video → env HIGGSFIELD_I2V_PATH (zonder dit pad staat
 *    de adapter uit, we gokken geen endpoint)
 *  - de veldnamen in de body (zie `requestBody`) en waar de video-URL in het
 *    statusantwoord staat (zie `extractVideoUrl`)
 *
 * Zonder configuratie krijgt het videoslot de status "video nodig": de
 * eigenaar koppelt dan zelf een mp4 op de reviewpagina.
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

/** HIGGSFIELD_API_KEY = "<key id>:<key secret>". */
export function higgsfieldConfigured(): boolean {
  return Boolean(process.env.HIGGSFIELD_API_KEY && process.env.HIGGSFIELD_I2V_PATH);
}

function authHeader(): string {
  return `Key ${process.env.HIGGSFIELD_API_KEY}`;
}

/** TODO(verify): veldnamen volgens de Kling-pagina van de Higgsfield Model API Reference. */
function requestBody(imageUrl: string, prompt: string, seconds: number) {
  return {
    model: "kling3_0",
    image_url: imageUrl,
    prompt,
    duration: seconds,
    aspect_ratio: "9:16",
    mode: "pro",
    sound: false,
  };
}

/** TODO(verify): plek van de video-URL in het statusantwoord. */
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
  const res = await fetch(`${BASE_URL}${process.env.HIGGSFIELD_I2V_PATH}`, {
    method: "POST",
    headers: { authorization: authHeader(), "content-type": "application/json" },
    body: JSON.stringify(requestBody(imageUrl, prompt, seconds)),
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
    return { state: "failed", error: `Higgsfield: ${status}` };
  }
  const url = extractVideoUrl(data);
  if (url) return { state: "done", videoUrl: url };
  return { state: "pending" };
}
