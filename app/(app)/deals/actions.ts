"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { activities, deals } from "@/lib/db/schema";

const optionalUuid = z.string().uuid().optional().or(z.literal(""));
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal(""));
const optionalNumber = z.preprocess(
  (v) => (v === "" || v === undefined ? undefined : v),
  z.coerce.number().nonnegative().optional(),
);

const dealSchema = z.object({
  title: z.string().trim().min(1).max(200),
  type: z
    .enum([
      "renovation",
      "new_build",
      "material_supply",
      "property_sale",
      "design",
      "legal",
      "other",
    ])
    .default("renovation"),
  stage: z
    .enum([
      "lead",
      "qualified",
      "proposal",
      "negotiation",
      "won",
      "lost",
      "on_hold",
    ])
    .default("lead"),
  valueEur: optionalNumber,
  probability: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.coerce.number().int().min(0).max(100).optional(),
  ),
  contactId: optionalUuid,
  propertyId: optionalUuid,
  ownerId: optionalUuid,
  expectedCloseDate: optionalDate,
  description: z.string().trim().max(5000).optional().or(z.literal("")),
});

function toValues(v: z.infer<typeof dealSchema>) {
  const closing = v.stage === "won" || v.stage === "lost";
  return {
    title: v.title,
    type: v.type,
    stage: v.stage,
    valueEur: v.valueEur === undefined ? null : String(v.valueEur),
    probability: v.probability ?? (v.stage === "won" ? 100 : v.stage === "lost" ? 0 : 10),
    contactId: v.contactId || null,
    propertyId: v.propertyId || null,
    ownerId: v.ownerId || null,
    expectedCloseDate: v.expectedCloseDate || null,
    closedAt: closing ? new Date() : null,
    description: v.description || null,
  };
}

export async function createDeal(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = dealSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/deals/new?error=validation");

  const values = toValues(parsed.data);
  const [row] = await db
    .insert(deals)
    .values({ ...values, ownerId: values.ownerId ?? session.user.id })
    .returning({ id: deals.id });

  revalidatePath("/deals");
  revalidatePath("/");
  redirect(`/deals/${row.id}`);
}

export async function updateDeal(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = dealSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/deals/${id}/edit?error=validation`);

  await db.update(deals).set(toValues(parsed.data)).where(eq(deals.id, id));

  revalidatePath("/deals");
  revalidatePath(`/deals/${id}`);
  revalidatePath("/");
  redirect(`/deals/${id}`);
}

export async function addDealNote(dealId: string, body: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const text = body.trim();
  if (!text) return;
  await db.insert(activities).values({
    type: "note",
    body: text,
    dealId,
    authorId: session.user.id,
  });
  revalidatePath(`/deals/${dealId}`);
}

const DEAL_STAGES = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
  "on_hold",
] as const;

/** Move a deal to another pipeline stage (used by the Kanban board, drag & drop). */
export async function moveDealToStage(dealId: string, stage: string) {
  const session = await auth();
  if (!session?.user) return;
  if (!(DEAL_STAGES as readonly string[]).includes(stage)) return;
  const s = stage as (typeof DEAL_STAGES)[number];

  const patch: { stage: (typeof DEAL_STAGES)[number]; probability?: number; closedAt: Date | null } = {
    stage: s,
    closedAt: null,
  };
  if (s === "won") {
    patch.probability = 100;
    patch.closedAt = new Date();
  } else if (s === "lost") {
    patch.probability = 0;
    patch.closedAt = new Date();
  }

  await db.update(deals).set(patch).where(eq(deals.id, dealId));
  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
}
