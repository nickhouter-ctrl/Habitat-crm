"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const ROLES = ["admin", "agent", "viewer"] as const;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Niet ingelogd.");
  if (session.user.role !== "admin") throw new Error("Alleen beheerders mogen medewerkers beheren.");
  return session.user as { id: string };
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht"),
  email: z.string().trim().toLowerCase().email("Ongeldig e-mailadres"),
  role: z.enum(ROLES).default("agent"),
  password: z.string().min(8, "Wachtwoord moet minstens 8 tekens zijn"),
});

export async function createTeamMember(formData: FormData) {
  await requireAdmin();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;

  const existing = await db.query.users.findFirst({ where: eq(users.email, d.email), columns: { id: true } });
  if (existing) throw new Error(`Er bestaat al een medewerker met ${d.email}.`);

  await db.insert(users).values({
    name: d.name,
    email: d.email,
    role: d.role,
    passwordHash: await hashPassword(d.password),
  });
  revalidatePath("/settings");
}

export async function setTeamMemberRole(id: string, formData: FormData) {
  const admin = await requireAdmin();
  const role = z.enum(ROLES).parse(String(formData.get("role")));
  if (id === admin.id && role !== "admin") {
    throw new Error("Je kunt je eigen beheerdersrol niet wijzigen.");
  }
  await db.update(users).set({ role }).where(eq(users.id, id));
  revalidatePath("/settings");
}

export async function deleteTeamMember(id: string) {
  const admin = await requireAdmin();
  if (id === admin.id) throw new Error("Je kunt je eigen account niet verwijderen.");
  await db.delete(users).where(eq(users.id, id));
  revalidatePath("/settings");
}
