/**
 * Wat Resend ons terugvertelt: bezorgd, gebounced, klacht, afgemeld.
 *
 * Dit is de enige betrouwbare bron voor bounces. De Return-Path van de
 * campagnemail wijst naar Resend en niet naar een van onze postvakken, dus de
 * foutmeldingen komen daar aan — niet in hi@ of bij Teresa.
 *
 * Instellen in het Resend-dashboard:
 *   https://crm.habitat-one.com/api/webhooks/resend
 * en het "whsec_…"-geheim in RESEND_WEBHOOK_SECRET.
 *
 * Fail-closed: zonder geheim accepteren we niets. Een vergeten env-var mag geen
 * open deur zijn waardoor iemand adressen op de afmeldlijst kan zetten.
 */
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { campaignRecipients, webhookEvents } from "@/lib/db/schema";
import { controleerSvix } from "@/lib/leads/resend-signature";
import { onderdruk, stelUit } from "@/lib/leads/suppress";
import { opnieuwNa } from "@/lib/leads/warmup";

export const dynamic = "force-dynamic";

/** Een harde bounce betekent: dit adres bestaat niet. Zacht = tijdelijk. */
function bounceSoort(data: Record<string, unknown>): "hard" | "soft" | "blocked" {
  const type = String((data.bounce as Record<string, unknown> | undefined)?.type ?? data.type ?? "").toLowerCase();
  const sub = String((data.bounce as Record<string, unknown> | undefined)?.subType ?? "").toLowerCase();
  if (type.includes("transient") || sub.includes("mailboxfull") || sub.includes("messagetoolarge")) return "soft";
  if (type.includes("suppressed") || sub.includes("suppressed") || sub.includes("block")) return "blocked";
  return "hard";
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });

  // De ruwe body is nodig: de signatuur gaat over de bytes, niet over het
  // resultaat van JSON.parse.
  const ruw = await request.text();
  const check = controleerSvix(
    secret,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    ruw,
  );
  if (!check.ok) return NextResponse.json({ error: check.reden }, { status: 401 });

  let payload: { type?: string; data?: Record<string, unknown> } = {};
  try {
    payload = JSON.parse(ruw);
  } catch {
    return NextResponse.json({ error: "geen geldige json" }, { status: 400 });
  }

  const soort = String(payload.type ?? "");
  const data = payload.data ?? {};
  const providerId = String(data.email_id ?? data.id ?? "");
  const headers = (data.headers ?? {}) as Record<string, string>;
  const eigenId = headers["X-Habitat-Recipient"] ?? headers["x-habitat-recipient"] ?? null;
  const adres = Array.isArray(data.to) ? String(data.to[0] ?? "") : String(data.to ?? "");

  // Eerst vastleggen wat er binnenkwam — audit én na te kijken als er iets raar
  // gaat. De tabel bestaat al voor de Holded-webhook.
  await db.insert(webhookEvents).values({
    source: "resend",
    eventType: soort || null,
    payload: payload as unknown as Record<string, unknown>,
  });

  // De rij terugvinden: eerst op ons eigen kenmerk, dan op het provider-id, en
  // als laatste op het adres binnen de meest recente campagne.
  const rij = eigenId
    ? await db.query.campaignRecipients.findFirst({ where: eq(campaignRecipients.id, eigenId) })
    : providerId
      ? await db.query.campaignRecipients.findFirst({ where: eq(campaignRecipients.messageId, providerId) })
      : adres
        ? await db.query.campaignRecipients.findFirst({
            where: sql`lower(${campaignRecipients.email}) = lower(${adres})`,
            orderBy: (t, { desc }) => [desc(t.sentAt)],
          })
        : undefined;

  const nu = new Date();
  let gedaan = "genegeerd";

  switch (soort) {
    case "email.delivered":
      if (rij) await db.update(campaignRecipients).set({ deliveredAt: nu }).where(eq(campaignRecipients.id, rij.id));
      gedaan = "bezorgd";
      break;

    case "email.bounced": {
      const soortBounce = bounceSoort(data);
      if (soortBounce === "soft") {
        // Postvak vol of even onbereikbaar: over een paar uur nog eens, en het
        // adres een week met rust laten. Niet op de afmeldlijst — dat zou een
        // goede klant voorgoed uitsluiten.
        if (rij) {
          const nogEens = (rij.attempts ?? 0) < 3;
          await db
            .update(campaignRecipients)
            .set(
              nogEens
                ? { status: "queued", nextAttemptAt: new Date(Date.now() + opnieuwNa(rij.attempts ?? 1)), bounceType: "soft", lastError: "zachte bounce" }
                : { status: "bounced", bouncedAt: nu, bounceType: "soft", lastError: "zachte bounce, opgegeven" },
            )
            .where(eq(campaignRecipients.id, rij.id));
        }
        if (adres) await stelUit(adres);
        gedaan = "zachte bounce";
      } else {
        if (rij) {
          await db
            .update(campaignRecipients)
            .set({ status: "bounced", bouncedAt: nu, bounceType: soortBounce })
            .where(eq(campaignRecipients.id, rij.id));
        }
        if (adres) await onderdruk(adres, "bounced");
        gedaan = `harde bounce (${soortBounce})`;
      }
      break;
    }

    case "email.complained":
      if (rij) {
        await db
          .update(campaignRecipients)
          .set({ status: "complained", complainedAt: nu })
          .where(eq(campaignRecipients.id, rij.id));
      }
      // Een spamklacht weegt zwaarder dan een afmelding: nooit meer mailen.
      if (adres) await onderdruk(adres, "complaint");
      gedaan = "klacht";
      break;

    default:
      break;
  }

  return NextResponse.json({ ok: true, soort, gedaan, gevonden: !!rij });
}
