"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { activities, companies, contacts, documents, holdedSyncMap } from "@/lib/db/schema";

/** Door de gebruiker gekozen klanttype → intern contacttype. */
const KLANTTYPE_TO_TYPE = {
  particulier: "customer",
  zakelijk: "customer",
  leverancier: "supplier",
  partner: "partner",
} as const;

const newContactSchema = z.object({
  klanttype: z.enum(["particulier", "zakelijk", "leverancier", "partner"]).default("particulier"),
  firstName: z.string().trim().max(120).optional().or(z.literal("")),
  lastName: z.string().trim().max(120).optional().or(z.literal("")),
  companyName: z.string().trim().max(200).optional().or(z.literal("")),
  companyVat: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  preferredLanguage: z.enum(["en", "nl", "es", "de"]).default("es"),
  addressLine: z.string().trim().max(200).optional().or(z.literal("")),
  postalCode: z.string().trim().max(20).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  province: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
});

function clean<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(obj)) {
    (out as Record<string, unknown>)[k] = v === "" ? null : v;
  }
  return out;
}

export async function createContact(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = newContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/contacts/new?error=validation");
  }
  const v = parsed.data;
  const type = KLANTTYPE_TO_TYPE[v.klanttype];
  const personName = [v.firstName, v.lastName].filter(Boolean).join(" ").trim();
  const displayName =
    personName || v.companyName?.trim() || (v.email || "").trim() || "(naamloos)";

  // Zakelijk → bedrijf aanmaken en koppelen (zo blijft het zakelijk/particulier-filter kloppen).
  let companyId: string | null = null;
  if (v.klanttype === "zakelijk" && v.companyName?.trim()) {
    const [co] = await db
      .insert(companies)
      .values(
        clean({
          name: v.companyName.trim(),
          type: "client",
          vatNumber: v.companyVat || "",
          email: v.email || "",
          phone: v.phone || "",
          addressLine: v.addressLine || "",
          postalCode: v.postalCode || "",
          city: v.city || "",
          province: v.province || "",
          country: "ES",
          ownerId: session.user.id,
        }),
      )
      .returning({ id: companies.id });
    companyId = co.id;
  }

  const [row] = await db
    .insert(contacts)
    .values(
      clean({
        firstName: v.firstName || "",
        lastName: v.lastName || "",
        name: displayName,
        email: v.email || "",
        phone: v.phone || "",
        type,
        preferredLanguage: v.preferredLanguage,
        addressLine: v.addressLine || "",
        postalCode: v.postalCode || "",
        city: v.city || "",
        province: v.province || "",
        country: "ES",
        notes: v.notes || "",
        companyId,
        ownerId: session.user.id,
      }),
    )
    .returning({ id: contacts.id });

  revalidatePath("/contacts");
  revalidatePath("/");
  redirect(`/contacts/${row.id}`);
}

export async function updateContact(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = newContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/contacts/${id}/edit?error=validation`);
  }
  const v = parsed.data;
  const type = KLANTTYPE_TO_TYPE[v.klanttype];
  const personName = [v.firstName, v.lastName].filter(Boolean).join(" ").trim();
  const displayName =
    personName || v.companyName?.trim() || (v.email || "").trim() || "(naamloos)";

  const existing = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
    columns: { companyId: true },
  });

  // Zakelijk → gekoppeld bedrijf bijwerken (of aanmaken). Anders ontkoppelen.
  let companyId: string | null = existing?.companyId ?? null;
  if (v.klanttype === "zakelijk" && v.companyName?.trim()) {
    const coData = clean({
      name: v.companyName.trim(),
      vatNumber: v.companyVat || "",
      email: v.email || "",
      phone: v.phone || "",
      addressLine: v.addressLine || "",
      postalCode: v.postalCode || "",
      city: v.city || "",
      province: v.province || "",
      country: "ES",
    });
    if (companyId) {
      await db.update(companies).set({ ...coData, updatedAt: new Date() }).where(eq(companies.id, companyId));
    } else {
      const [co] = await db
        .insert(companies)
        .values({ ...coData, type: "client", ownerId: session.user.id })
        .returning({ id: companies.id });
      companyId = co.id;
    }
  } else {
    companyId = null;
  }

  await db
    .update(contacts)
    .set(
      clean({
        firstName: v.firstName || "",
        lastName: v.lastName || "",
        name: displayName,
        email: v.email || "",
        phone: v.phone || "",
        type,
        preferredLanguage: v.preferredLanguage,
        addressLine: v.addressLine || "",
        postalCode: v.postalCode || "",
        city: v.city || "",
        province: v.province || "",
        country: "ES",
        companyId,
        notes: v.notes || "",
        updatedAt: new Date(),
      }),
    )
    .where(eq(contacts.id, id));

  revalidatePath(`/contacts/${id}`);
  revalidatePath("/contacts");
  redirect(`/contacts/${id}`);
}

export async function addContactNote(contactId: string, body: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const text = body.trim();
  if (!text) return;

  await db.insert(activities).values({
    type: "note",
    body: text,
    contactId,
    authorId: session.user.id,
  });
  await db
    .update(contacts)
    .set({ lastContactedAt: new Date() })
    .where(eq(contacts.id, contactId));

  revalidatePath(`/contacts/${contactId}`);
}

export async function deleteContact(id: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Beschermd: niet verwijderen als er verstuurde/betaalde facturen aan hangen.
  const blocking = await db.query.documents.findFirst({
    where: and(
      eq(documents.contactId, id),
      inArray(documents.kind, ["invoice", "proforma", "creditnote", "salesreceipt"]),
      ne(documents.status, "draft"),
    ),
    columns: { id: true },
  });
  if (blocking) {
    redirect(`/contacts/${id}?verwijderen=facturen`);
  }

  // Holded-koppeling opruimen zodat het contact niet terug-synct.
  await db
    .delete(holdedSyncMap)
    .where(and(eq(holdedSyncMap.entityType, "contact"), eq(holdedSyncMap.localId, id)));
  await db.delete(contacts).where(eq(contacts.id, id));

  revalidatePath("/contacts");
  revalidatePath("/");
  redirect("/contacts");
}
