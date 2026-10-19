import { NextResponse } from "next/server";
import { weigerRoute } from "@/lib/auth/guards";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { readPlan } from "@/lib/ai-plan-extract";
import { MAX_PLAN_BYTES } from "@/lib/plan-measurements";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await weigerRoute("calculator");
  if (denied) return denied;
  if (!(await rateLimit(`calculator-plan:${clientIp(request)}`, 10, 3600, { strikt: true }))) {
    return NextResponse.json({ error: "Je hebt het maximale aantal tekeninguitlezingen voor dit uur bereikt." }, { status: 429 });
  }
  let form: FormData;
  try { form = await request.formData(); } catch {
    return NextResponse.json({ error: "Het bestand kon niet worden gelezen." }, { status: 400 });
  }
  const file = form.get("file");
  const reference = form.get("reference") ?? "";
  if (typeof reference !== "string" || reference.length > 240) return NextResponse.json({ error: "Gebruik maximaal 240 tekens voor de referentiemaat." }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Kies eerst een PDF of afbeelding." }, { status: 400 });
  if (file.size > MAX_PLAN_BYTES) return NextResponse.json({ error: "Bestand te groot. Gebruik maximaal 3,8 MB per tekening of foto." }, { status: 413 });
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const allowed = (ext === "pdf" && file.type === "application/pdf") ||
    (["jpg", "jpeg", "png", "webp"].includes(ext) && file.type === ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as Record<string, string>)[ext]);
  if (!allowed) return NextResponse.json({ error: "Alleen PDF, JPG, PNG en WebP worden ondersteund." }, { status: 415 });
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const validSignature = ext === "pdf" ? buffer.subarray(0, 5).toString("ascii") === "%PDF-"
      : ext === "jpg" || ext === "jpeg" ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
      : ext === "png" ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    if (!validSignature) return NextResponse.json({ error: "De bestandinhoud komt niet overeen met het gekozen bestandstype." }, { status: 415 });
    const result = await readPlan({ buffer, filename: file.name, contentType: file.type, reference });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const message = code === "AI_PLAN_NOT_CONFIGURED" ? "De tekeninguitlezing is nog niet geconfigureerd."
      : code === "AI_PLAN_BUSY" ? "De AI is druk. Probeer het over een paar minuten opnieuw."
      : code === "AI_PLAN_INVALID_RESPONSE" ? "De tekening leverde geen betrouwbaar uitleesbaar resultaat op. Voer de maten handmatig in."
      : "De tekening kon niet worden uitgelezen. Probeer een scherpere afbeelding of voer de maten handmatig in.";
    console.error("Tekeninguitlezing mislukt", code);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
