"use server";

/**
 * Besluiten via de knop in de meldingsmail. Geen ingelogde gebruiker: de token
 * uit de link is het bewijs. Daarom:
 *
 * - de token hoort bij één factuur en vervalt zodra die is afgehandeld;
 * - de actie is een POST, nooit een GET — anders zou een mailscanner die de link
 *   voorophaalt de factuur goedkeuren;
 * - alles wordt vastgelegd met `decidedVia: "mail"`, zodat een besluit uit de
 *   mail te onderscheiden is van een besluit in het CRM.
 */
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { purchaseInvoiceReviews, users } from "@/lib/db/schema";
import { approveInvoiceReview, rejectInvoiceReview, type ApprovalOverrides } from "@/lib/purchase-invoice-intake";

function amountOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim().replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function uuidOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length === 36 ? s : null;
}

/**
 * Wie klikte er? De meldingsmail gaat naar iedere keurder apart, met een link
 * waar zijn eigen gebruikers-id in zit. Dat is geen beveiliging — de token is
 * het bewijs dat je mag beslissen — maar wel het verschil tussen "goedgekeurd
 * door Hans" en een lege naam in het logboek, wat eerder gebeurde.
 */
async function actorFrom(formData: FormData): Promise<string | null> {
  // Ben je gewoon ingelogd (bv. via de inloglink in dezelfde mail), dan is dat
  // de betrouwbaarste bron; de id uit de link is de terugval.
  const sessie = await auth();
  if (sessie?.user?.id) return sessie.user.id;
  const id = uuidOrNull(formData.get("w"));
  if (!id) return null;
  const u = await db.query.users.findFirst({ where: eq(users.id, id), columns: { id: true } });
  return u?.id ?? null;
}

/** Token → review, mits nog openstaand en niet verlopen. */
async function resolveToken(token: string) {
  const review = await db.query.purchaseInvoiceReviews.findFirst({
    where: eq(purchaseInvoiceReviews.actionToken, token),
  });
  if (!review) return null;
  if (review.status !== "pending") return null;
  if (review.actionTokenExpiresAt && review.actionTokenExpiresAt.getTime() < Date.now()) return null;
  return review;
}

function refresh() {
  revalidatePath("/inkooporders/te-verwerken");
  revalidatePath("/inkooporders");
  revalidatePath("/");
}

export async function approveViaTokenAction(token: string, formData: FormData) {
  const review = await resolveToken(token);
  if (!review) redirect(`/inkoop/keuren/${token}`);

  const overrides: ApprovalOverrides = {
    total: amountOrNull(formData.get("total")),
    projectId: uuidOrNull(formData.get("projectId")),
    kind: formData.get("kind") === "labor" ? "labor" : formData.get("kind") === "material" ? "material" : null,
    hours: amountOrNull(formData.get("hours")),
  };
  await approveInvoiceReview({ reviewId: review.id, overrides, userId: await actorFrom(formData), via: "mail" });
  refresh();
  // Met ?gedaan=goedgekeurd toont de pagina een bevestiging in plaats van de
  // kale melding "al afgehandeld" — die las als een foutmelding op je eigen klik.
  redirect(`/inkoop/keuren/${token}?gedaan=goedgekeurd`);
}

export async function rejectViaTokenAction(token: string, formData: FormData) {
  const review = await resolveToken(token);
  if (!review) redirect(`/inkoop/keuren/${token}`);

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) redirect(`/inkoop/keuren/${token}`);

  const to = String(formData.get("mailTo") ?? "").trim();
  const subject = String(formData.get("mailSubject") ?? "").trim();
  const body = String(formData.get("mailBody") ?? "").trim();
  const verstuur = formData.get("sendMail") === "on" && to.includes("@") && subject && body;

  await rejectInvoiceReview({
    reviewId: review.id,
    reason,
    userId: await actorFrom(formData),
    via: "mail",
    mail: verstuur
      ? {
          to,
          subject,
          text: body,
          html: `<div style="white-space:pre-wrap">${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`,
        }
      : undefined,
  });
  refresh();
  redirect(`/inkoop/keuren/${token}?gedaan=afgekeurd`);
}
