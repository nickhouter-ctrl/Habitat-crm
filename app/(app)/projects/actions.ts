"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
}

const updateSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht"),
  description: z.string().trim().optional(),
  code: z.string().trim().optional(),
  status: z.enum(["active", "archived"]).default("active"),
  contactId: z.string().trim().optional(),
  ownerId: z.string().trim().optional(),
  propertyId: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
});

function uuidOrNull(v?: string) {
  return v && v.length === 36 ? v : null;
}
function dateOrNull(v?: string) {
  return v && v.length ? v : null;
}

export async function updateProject(id: string, formData: FormData) {
  await requireUser();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  await db
    .update(projects)
    .set({
      name: d.name,
      description: d.description || null,
      code: d.code || null,
      status: d.status,
      contactId: uuidOrNull(d.contactId),
      ownerId: uuidOrNull(d.ownerId),
      propertyId: uuidOrNull(d.propertyId),
      startDate: dateOrNull(d.startDate),
      endDate: dateOrNull(d.endDate),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id));
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
}

export async function deleteProject(id: string) {
  await requireUser();
  await db.delete(projects).where(eq(projects.id, id));
  revalidatePath("/projects");
  redirect("/projects");
}
