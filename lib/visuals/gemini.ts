/**
 * Gemini-client voor project-visualisaties (raw fetch, huisstijl van
 * lib/ai-invoice-extract.ts — geen SDK's).
 *
 * - Beeld: `gemini-2.5-flash-image` ("Nano Banana"): plattegrond→render,
 *   SketchUp-aanzicht→fotorealistisch (geometrie-behoud), foto-restyle, tuin.
 * - Video: Veo image-to-video via `:predictLongRunning`; geeft een
 *   operation-name terug die je pollt tot `done`, daarna de file-URI downloaden.
 *
 * Vereist `GEMINI_API_KEY`. Kosten: beeld ± €0,04; video (8 s) ± €1–3.
 * Free tier: beperkt aantal beeldgeneraties per dag, geen Veo.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
const VIDEO_MODEL = process.env.GEMINI_VIDEO_MODEL ?? "veo-3.1-fast-generate-001";

export function visualsAiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY ontbreekt.");
  return key;
}

export interface ReferenceImage {
  bytes: Buffer | Uint8Array;
  mimeType: string; // image/png, image/jpeg, image/webp
}

/**
 * Genereer één beeld op basis van een prompt + referentiebeelden (het
 * SketchUp-aanzicht, de plattegrond of de bestaande-ruimte-foto).
 * Retourneert de beeldbytes, of gooit met een leesbare melding.
 */
export async function generateImage(args: {
  prompt: string;
  referenceImages?: ReferenceImage[];
  /** Bijv. "16:9" (default van het model als weggelaten). */
  aspectRatio?: string;
}): Promise<{ bytes: Buffer; mimeType: string }> {
  const parts: Array<Record<string, unknown>> = [{ text: args.prompt }];
  for (const ref of args.referenceImages ?? []) {
    parts.push({
      inline_data: {
        mime_type: ref.mimeType,
        data: Buffer.from(ref.bytes).toString("base64"),
      },
    });
  }

  const body: Record<string, unknown> = {
    contents: [{ parts }],
    ...(args.aspectRatio
      ? { generationConfig: { imageConfig: { aspectRatio: args.aspectRatio } } }
      : {}),
  };

  const res = await fetch(`${API_BASE}/models/${IMAGE_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey(), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini beeld-API ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = JSON.parse(text) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blokkeerde de prompt: ${data.promptFeedback.blockReason}`);
  }
  for (const part of data.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      return {
        bytes: Buffer.from(part.inlineData.data, "base64"),
        mimeType: part.inlineData.mimeType ?? "image/png",
      };
    }
  }
  const reason = data.candidates?.[0]?.finishReason;
  const modelText = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
  throw new Error(
    `Gemini gaf geen beeld terug${reason ? ` (finishReason: ${reason})` : ""}${modelText ? ` — model zei: ${modelText.slice(0, 200)}` : ""}`,
  );
}

/**
 * Start een Veo image-to-video-generatie (8 s clip van een render).
 * Retourneert de operation-name voor {@link pollVideoOperation}.
 */
export async function startVideoOperation(args: {
  prompt: string;
  image: ReferenceImage;
  /** "16:9" (default) of "9:16". */
  aspectRatio?: string;
}): Promise<string> {
  const body = {
    instances: [
      {
        prompt: args.prompt,
        image: {
          bytesBase64Encoded: Buffer.from(args.image.bytes).toString("base64"),
          mimeType: args.image.mimeType,
        },
      },
    ],
    parameters: { aspectRatio: args.aspectRatio ?? "16:9" },
  };
  const res = await fetch(`${API_BASE}/models/${VIDEO_MODEL}:predictLongRunning`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey(), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Veo start ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = JSON.parse(text) as { name?: string };
  if (!data.name) throw new Error(`Veo gaf geen operation-name terug: ${text.slice(0, 200)}`);
  return data.name;
}

/** Poll een Veo-operation. `fileUri` is gezet zodra de video klaarstaat. */
export async function pollVideoOperation(
  operationName: string,
): Promise<{ done: boolean; fileUri?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/${operationName}`, {
    headers: { "x-goog-api-key": apiKey() },
  });
  const text = await res.text();
  if (!res.ok) return { done: false, error: `Veo poll ${res.status}: ${text.slice(0, 300)}` };

  const data = JSON.parse(text) as {
    done?: boolean;
    error?: { message?: string };
    response?: {
      generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> };
      generatedVideos?: Array<{ video?: { uri?: string } }>;
    };
  };
  if (!data.done) return { done: false };
  if (data.error) return { done: true, error: data.error.message ?? "onbekende Veo-fout" };
  const uri =
    data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ??
    data.response?.generatedVideos?.[0]?.video?.uri;
  if (!uri) return { done: true, error: `klaar maar geen video-URI in antwoord: ${text.slice(0, 300)}` };
  return { done: true, fileUri: uri };
}

/** Download de klaargezette video (URI uit {@link pollVideoOperation}). */
export async function downloadVideoBytes(fileUri: string): Promise<Buffer> {
  const res = await fetch(fileUri, {
    headers: { "x-goog-api-key": apiKey() },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Video-download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
