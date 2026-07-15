"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWriteUser } from "@/lib/auth/guards";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { properties } from "@/lib/db/schema";
import { deletePropertyImageByUrl, uploadPropertyImage } from "@/lib/storage";
import { revalidateWebsite } from "@/lib/website";

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

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireWriteUser();
}

export async function createProperty(formData: FormData) {
  const user = await requireUser();

  const parsed = propertySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/properties/new?error=validation");

  const values = toValues(parsed.data);
  const [row] = await db
    .insert(properties)
    .values({ ...values, ownerId: values.ownerId ?? user.id })
    .returning({ id: properties.id });

  revalidatePath("/properties");
  revalidatePath("/");
  await revalidateWebsite(["/properties"]);
  redirect(`/properties/${row.id}`);
}

export async function updateProperty(id: string, formData: FormData) {
  await requireUser();

  const parsed = propertySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/properties/${id}/edit?error=validation`);

  await db.update(properties).set(toValues(parsed.data)).where(eq(properties.id, id));

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  revalidatePath("/");
  await revalidateWebsite(["/properties", `/properties/${id}`]);
  redirect(`/properties/${id}`);
}

/* ------------------------------------------------------------------ photos */

async function currentImages(propertyId: string): Promise<string[]> {
  const row = await db.query.properties.findFirst({
    where: eq(properties.id, propertyId),
    columns: { images: true },
  });
  if (!row) throw new Error("Pand niet gevonden.");
  return row.images ?? [];
}

async function saveImages(propertyId: string, images: string[]) {
  await db.update(properties).set({ images }).where(eq(properties.id, propertyId));
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/properties");
  await revalidateWebsite(["/properties", `/properties/${propertyId}`]);
}

/** Upload one or more photos (from a multipart form field named `photos`). */
export async function uploadPropertyImages(propertyId: string, formData: FormData) {
  await requireUser();

  const files = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    redirect(`/properties/${propertyId}?error=no-files`);
  }

  const uploaded: string[] = [];
  for (const file of files) {
    uploaded.push(await uploadPropertyImage(propertyId, file));
  }

  const images = await currentImages(propertyId);
  await saveImages(propertyId, [...images, ...uploaded]);
  redirect(`/properties/${propertyId}`);
}

export async function removePropertyImage(propertyId: string, formData: FormData) {
  await requireUser();
  const url = String(formData.get("url") ?? "");
  if (!url) return;
  const images = (await currentImages(propertyId)).filter((u) => u !== url);
  await saveImages(propertyId, images);
  // Best-effort cleanup of the stored object.
  await deletePropertyImageByUrl(url);
}

export async function setPrimaryPropertyImage(propertyId: string, formData: FormData) {
  await requireUser();
  const url = String(formData.get("url") ?? "");
  if (!url) return;
  const rest = (await currentImages(propertyId)).filter((u) => u !== url);
  await saveImages(propertyId, [url, ...rest]);
}
