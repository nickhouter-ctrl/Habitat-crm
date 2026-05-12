"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { properties } from "@/lib/db/schema";

const optionalUuid = z.string().uuid().optional().or(z.literal(""));
const optionalInt = z.preprocess(
  (v) => (v === "" || v === undefined ? undefined : v),
  z.coerce.number().int().nonnegative().optional(),
);
const optionalDecimal = z.preprocess(
  (v) => (v === "" || v === undefined ? undefined : v),
  z.coerce.number().nonnegative().optional(),
);

const propertySchema = z.object({
  title: z.string().trim().min(1).max(200),
  reference: z.string().trim().max(60).optional().or(z.literal("")),
  status: z
    .enum(["available", "reserved", "under_offer", "sold", "withdrawn"])
    .default("available"),
  type: z
    .enum([
      "villa",
      "apartment",
      "townhouse",
      "plot",
      "renovation_project",
      "commercial",
      "other",
    ])
    .default("villa"),
  priceEur: optionalDecimal,
  bedrooms: optionalInt,
  bathrooms: optionalInt,
  plotSqm: optionalInt,
  builtSqm: optionalInt,
  location: z.string().trim().max(200).optional().or(z.literal("")),
  description: z.string().trim().max(8000).optional().or(z.literal("")),
  ownerContactId: optionalUuid,
  ownerId: optionalUuid,
  isPublished: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

function toValues(v: z.infer<typeof propertySchema>) {
  return {
    title: v.title,
    reference: v.reference || null,
    status: v.status,
    type: v.type,
    priceEur: v.priceEur === undefined ? null : String(v.priceEur),
    bedrooms: v.bedrooms ?? null,
    bathrooms: v.bathrooms ?? null,
    plotSqm: v.plotSqm ?? null,
    builtSqm: v.builtSqm ?? null,
    location: v.location || null,
    description: v.description || null,
    ownerContactId: v.ownerContactId || null,
    ownerId: v.ownerId || null,
    isPublished: v.isPublished,
  };
}

export async function createProperty(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = propertySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/properties/new?error=validation");

  const values = toValues(parsed.data);
  const [row] = await db
    .insert(properties)
    .values({ ...values, ownerId: values.ownerId ?? session.user.id })
    .returning({ id: properties.id });

  revalidatePath("/properties");
  revalidatePath("/");
  redirect(`/properties/${row.id}`);
}

export async function updateProperty(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = propertySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/properties/${id}/edit?error=validation`);

  await db.update(properties).set(toValues(parsed.data)).where(eq(properties.id, id));

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  revalidatePath("/");
  redirect(`/properties/${id}`);
}
