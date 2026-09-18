"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireAdmin as requireBeheerder, requireToegang } from "@/lib/auth/guards";
import { ROLES } from "@/lib/auth/modules";
import { LOCALES } from "@/lib/i18n";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { activities, users } from "@/lib/db/schema";

/** Beheerderscontrole leest de rol uit de database — niet uit het sessiecookie. */
async function requireAdmin() {
  const t = await requireBeheerder();
  return { id: t.id };
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

/**
 * Nieuw wachtwoord voor een medewerker. Er is geen "wachtwoord opvragen": het
 * staat als bcrypt-hash in de database en is dus onomkeerbaar. Alleen een
 * beheerder mag dit, en het wordt vastgelegd in het logboek — een ander z'n
 * wachtwoord wijzigen hoort niet stil te gebeuren.
 */
export async function setTeamMemberPassword(id: string, formData: FormData) {
  const admin = await requireAdmin();
  const password = z
    .string()
    .min(8, "Wachtwoord moet minstens 8 tekens zijn")
    .parse(String(formData.get("password") ?? ""));

  const target = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { id: true, email: true, name: true },
  });
  if (!target) throw new Error("Medewerker niet gevonden.");

  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, id));
  await db.insert(activities).values({
    type: "note",
    subject: `Wachtwoord opnieuw ingesteld: ${target.name ?? target.email}`,
    body: id === admin.id ? "Eigen wachtwoord gewijzigd." : `Ingesteld door een beheerder.`,
    authorId: admin.id,
  });
  revalidatePath("/settings");
}

/** Telefoonnummer van een medewerker — komt onder de voorschotbrief te staan. */
export async function setTeamMemberPhone(id: string, formData: FormData) {
  await requireAdmin();
  const phone = String(formData.get("phone") ?? "").trim();
  await db.update(users).set({ phone: phone || null }).where(eq(users.id, id));
  revalidatePath("/settings");
}

/**
 * Eigen wachtwoord wijzigen. Tot nu toe kon dat niemand: een wachtwoord zetten
 * was alleen iets van een beheerder. Wie een account krijgt via een inloglink
 * hoort zelf een wachtwoord te kunnen kiezen zonder daarvoor langs iemand te
 * moeten. Het huidige wachtwoord is verplicht, zodat een openstaande sessie op
 * een onbeheerde computer niet meteen het account kan overnemen.
 */
export async function changeOwnPassword(formData: FormData) {
  const ik = await requireToegang();
  const huidig = String(formData.get("huidig") ?? "");
  const nieuw = z
    .string()
    .min(8, "Nieuw wachtwoord moet minstens 8 tekens zijn")
    .parse(String(formData.get("nieuw") ?? ""));
  if (nieuw !== String(formData.get("herhaal") ?? "")) throw new Error("De twee nieuwe wachtwoorden zijn niet gelijk.");

  const rij = await db.query.users.findFirst({
    where: eq(users.id, ik.id),
    columns: { id: true, email: true, name: true, passwordHash: true },
  });
  if (!rij) throw new Error("Account niet gevonden.");
  // Een account dat via een inloglink is gemaakt heeft nog geen wachtwoord;
  // dan is er ook niets te controleren.
  if (rij.passwordHash && !(await verifyPassword(huidig, rij.passwordHash))) {
    throw new Error("Het huidige wachtwoord klopt niet.");
  }

  await db.update(users).set({ passwordHash: await hashPassword(nieuw) }).where(eq(users.id, ik.id));
  await db.insert(activities).values({
    type: "note",
    subject: `Wachtwoord gewijzigd: ${rij.name ?? rij.email}`,
    body: "Door de medewerker zelf gewijzigd.",
    authorId: ik.id,
  });
  revalidatePath("/settings");
}

/**
 * Eigen taal kiezen. De brontaal van het CRM is Nederlands; Engels en Spaans
 * komen uit de woordenboeken in lib/i18n. Een tekst die nog niet vertaald is
 * blijft Nederlands staan — dat is beter dan een sleutelnaam op het scherm.
 */
export async function changeOwnLocale(formData: FormData) {
  const ik = await requireToegang();
  const locale = z.enum(LOCALES).parse(String(formData.get("locale") ?? "nl"));
  await db.update(users).set({ locale }).where(eq(users.id, ik.id));
  // De hele app hangt aan de taal: layout, menu en elke pagina.
  revalidatePath("/", "layout");
}
