"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { quoteRequests } from "@/lib/db/schema";
import { recordLesson } from "@/lib/autopilot/lessons";
import { currentItems, diffItems, loadProposal, saveProposal } from "@/lib/autopilot/quotes";
import { sendDocumentCustom } from "../documents/actions";
import { mailQuoteRequestCustomer } from "../aanvragen/actions";

const regels = (items: { units: number; name: string; price: number }[]) => items.map((i) => `${i.units} × ${i.name} à ${i.price}`).join("; ");

/** Versturen na (eventueel) aanpassen; bewaart wat er veranderd is als les. */
export async function sendProposal(requestId: string, formData: FormData) {
  await requireModule("verkoop");
  const p = await loadProposal(requestId);
  if (!p || (p.status !== "ready" && p.status !== "review")) return;
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  const context = `Offerte-aanvraag ${p.customer}: ${p.lines.map((l) => `${l.units} ${l.unit ?? "×"} ${l.name}`).join(", ")}`;
  if (p.body) await recordLesson({ kind: "mail", context, draft: p.body, final: message });
  if (p.documentId) {
    const now = await currentItems(p.documentId);
    if (now) {
      const diff = diffItems(p.itemsSnapshot, now);
      await recordLesson({ kind: "quote", context: `${context}${diff ? ` — aangepast: ${diff}` : ""}`, draft: regels(p.itemsSnapshot), final: regels(now) });
    }
  }
  await saveProposal({ ...p, status: "sent", decidedAt: new Date().toISOString() });
  await db.update(quoteRequests).set({ status: "accepted", acceptedAt: sql`coalesce(${quoteRequests.acceptedAt}, now())`, updatedAt: new Date() })
    .where(eq(quoteRequests.id, requestId));
  revalidatePath("/autopilot");

  const fd = new FormData();
  fd.set("subject", subject);
  fd.set("message", message);
  // Beide functies sturen door naar het document / de aanvraag.
  if (p.documentId) await sendDocumentCustom(p.documentId, fd);
  else await mailQuoteRequestCustomer(requestId, fd);
}

/** Niet versturen: Nick handelt het zelf af. */
export async function dismissProposal(requestId: string) {
  await requireModule("verkoop");
  const p = await loadProposal(requestId);
  if (!p) return;
  await saveProposal({ ...p, status: "rejected", decidedAt: new Date().toISOString() });
  revalidatePath("/autopilot");
}
