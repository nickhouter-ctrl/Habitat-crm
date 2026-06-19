"use server";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { quoteRequests } from "@/lib/db/schema";
import { confirmAppointment } from "@/lib/appointments";

// Geen auth — aangeroepen vanaf de publieke /book/[token]-pagina door de klant.
export async function confirmProposedSlot(
  token: string,
  index: number,
): Promise<{ ok: boolean; when?: string; error?: "not_found" | "already" | "invalid" }> {
  const req = await db.query.quoteRequests.findFirst({ where: eq(quoteRequests.bookingToken, token) });
  if (!req) return { ok: false, error: "not_found" };
  if (req.status === "accepted") return { ok: false, error: "already" };

  const slot = (req.proposedSlots ?? [])[index];
  if (!slot) return { ok: false, error: "invalid" };
  const startsAt = new Date(`${slot.date}T${slot.time}`);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, error: "invalid" };

  await confirmAppointment(req, { startsAt, createdBy: null });
  const when = startsAt.toLocaleString(req.locale === "en" ? "en-GB" : req.locale ?? "nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  return { ok: true, when };
}
