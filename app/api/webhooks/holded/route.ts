import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { webhookEvents } from "@/lib/db/schema";
import { handleHoldedWebhook } from "@/lib/holded/sync";
import type { HoldedWebhookPayload } from "@/lib/holded/types";

// Always run dynamically — this receives external POSTs.
export const dynamic = "force-dynamic";

/**
 * Inbound Holded webhook receiver.
 *
 * Configure the webhook in Holded to point at:
 *   https://<your-domain>/api/webhooks/holded?key=<HOLDED_WEBHOOK_SECRET>
 * (or send the secret as an `X-Webhook-Secret` header).
 */
export async function POST(request: Request) {
  const expected = process.env.HOLDED_WEBHOOK_SECRET;
  if (expected) {
    const url = new URL(request.url);
    const provided =
      url.searchParams.get("key") ?? request.headers.get("x-webhook-secret");
    if (provided !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let payload: HoldedWebhookPayload | null = null;
  try {
    payload = (await request.json()) as HoldedWebhookPayload;
  } catch {
    payload = null;
  }

  const eventType =
    payload && typeof payload === "object"
      ? String(payload.name ?? payload.event ?? "") || null
      : null;

  const [event] = await db
    .insert(webhookEvents)
    .values({ source: "holded", eventType, payload: payload ?? null })
    .returning({ id: webhookEvents.id });

  try {
    // Pull vanuit Holded is uitgeschakeld — we synchroniseren alleen CRM → Holded
    // (push). Inkomende events loggen we wél (replaybaar), maar passen we niet
    // meer toe; dit voorkwam dubbele projecten/facturen. Zet de regel terug om
    // het pullen weer aan te zetten.
    // await handleHoldedWebhook(payload);
    void handleHoldedWebhook;
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.id, event.id));
  } catch (err) {
    // Log the failure but still 200 — the raw event is persisted and can be replayed.
    await db
      .update(webhookEvents)
      .set({ error: err instanceof Error ? err.message : String(err) })
      .where(eq(webhookEvents.id, event.id));
  }

  return NextResponse.json({ ok: true });
}

// Some webhook providers probe with a GET first.
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "holded-webhook" });
}
