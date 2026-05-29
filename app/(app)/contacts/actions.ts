"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { activities, contacts, deals, documents, holdedSyncMap } from "@/lib/db/schema";

const contactSchema = z.object({
  firstName: z.string().trim().max(120).optional().or(z.literal("")),
  lastName: z.string().trim().max(120).optional().or(z.literal("")),
  name: z.string().trim().max(200).optional().or(z.literal("")),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  mobile: z.string().trim().max(40).optional().or(z.literal("")),
  jobTitle: z.string().trim().max(160).optional().or(z.literal("")),
  type: z
    .enum(["lead", "customer", "owner", "partner", "supplier", "other"])
    .default("lead"),
  stage: z
    .enum(["new", "contacted", "qualified", "proposal", "won", "lost"])
    .default("new"),
  preferredLanguage: z.enum(["en", "nl", "es", "de"]).default("es"),
  source: z.string().trim().max(80).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
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

  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/contacts/new?error=validation");
  }
  const v = parsed.data;
  const displayName =
    v.name?.trim() ||
    [v.firstName, v.lastName].filter(Boolean).join(" ").trim() ||
    v.email ||
    "(naamloos)";

  const [row] = await db
    .insert(contacts)
    .values(
      clean({
        ...v,
        name: displayName,
        ownerId: session.user.id,
      }),
    )
    .returning({ id: contacts.id });

  // New lead → start a deal so it's ready to pick up in the pipeline.
  if (v.type === "lead") {
    await db.insert(deals).values({
      title: `Project — ${displayName}`,
      type: "renovation",
      stage: "lead",
      contactId: row.id,
      ownerId: session.user.id,
    });
    revalidatePath("/deals");
  }

  revalidatePath("/contacts");
  revalidatePath("/");
  redirect(`/contacts/${row.id}`);
}

export async function updateContact(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/contacts/${id}/edit?error=validation`);
  }
  const v = parsed.data;
  const displayName =
    v.name?.trim() ||
    [v.firstName, v.lastName].filter(Boolean).join(" ").trim() ||
    v.email ||
    "(naamloos)";

  await db
    .update(contacts)
    .set(clean({ ...v, name: displayName }))
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
