"use server";

/**
 * Acties van de goedkeuringspoort. Elke actie is een bewuste beslissing over
 * geld dat de deur uit gaat, dus: alleen voor gebruikers die mogen bewerken, en
 * altijd met een spoor in `activities` van wie het deed.
 */
import { revalidatePath } from "next/cache";

import { requireWriteUser } from "@/lib/auth/guards";
import {
  approveInvoiceReview,
  ignoreInvoiceReview,
  rejectInvoiceReview,
  type ApprovalOverrides,
} from "@/lib/purchase-invoice-intake";

/** Bedrag-string (NL-komma of punt) → number; leeg/ongeldig → null. */
function amountOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function uuidOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length === 36 ? s : null;
}

function refresh() {
  revalidatePath("/inkooporders/te-verwerken");
  revalidatePath("/inkooporders");
  revalidatePath("/");
}

export async function approveReviewAction(reviewId: string, formData: FormData) {
  const user = await requireWriteUser();

  // Verdeling over meerdere werven: regel-index → project + uren + bedrag.
  const split: NonNullable<ApprovalOverrides["split"]> = [];
  for (const [key, value] of formData.entries()) {
    const m = key.match(/^split_(\d+)_projectId$/);
    if (!m) continue;
    const projectId = uuidOrNull(value);
    const amount = amountOrNull(formData.get(`split_${m[1]}_amount`));
    if (!projectId || amount == null) continue;
    split.push({ projectId, amount, hours: amountOrNull(formData.get(`split_${m[1]}_hours`)) });
  }

  const overrides: ApprovalOverrides = {
    supplier: String(formData.get("supplier") ?? "").trim() || null,
    reference: String(formData.get("reference") ?? "").trim() || null,
    total: amountOrNull(formData.get("total")),
    subtotal: amountOrNull(formData.get("subtotal")),
    projectId: uuidOrNull(formData.get("projectId")),
    kind: formData.get("kind") === "labor" ? "labor" : formData.get("kind") === "material" ? "material" : null,
    hours: amountOrNull(formData.get("hours")),
    hoursAlreadyLogged: formData.get("hoursAlreadyLogged") === "on",
    split: split.length > 1 ? split : undefined,
  };

  await approveInvoiceReview({ reviewId, overrides, userId: user.id, via: "app" });
  refresh();
}

export async function rejectReviewAction(reviewId: string, formData: FormData) {
  const user = await requireWriteUser();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return; // zonder reden afkeuren zegt de leverancier niets
  await rejectInvoiceReview({ reviewId, reason, userId: user.id, via: "app" });
  refresh();
}

export async function ignoreReviewAction(reviewId: string) {
  const user = await requireWriteUser();
  await ignoreInvoiceReview({ reviewId, userId: user.id });
  refresh();
}
