"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireModule } from "@/lib/auth/guards";
import { contactDisplayName } from "@/lib/contact-name";
import { db } from "@/lib/db";
import { activities, contacts, prospects } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/leads/normalize";

/**
 * Prospect → contact. Dit is de brug waar de hele opzet om draait: de 7.000
 * bedrijven staan bewust búiten de contactenlijst, en pas wie klant of echte
 * lead wordt, komt erin. Zo blijft de contactenlijst de lijst van mensen met wie
 * we echt zaken doen.
 *
 * Idempotent: een tweede keer klikken vindt `contactId` al gevuld en doet niets
 * nieuws. Bestaat er al een contact met hetzelfde e-mailadres, dan koppelen we
 * daaraan in plaats van een dubbele rij te maken.
 */
export async function promoteProspect(id: string, formData: FormData) {
  const user = await requireModule("leads");
  z.string().uuid().parse(id);
  const type = formData.get("type") === "customer" ? "customer" : "lead";

  const p = await db.query.prospects.findFirst({ where: eq(prospects.id, id) });
  if (!p) redirect("/leads/prospects?error=Deze+prospect+bestaat+niet+meer");
  if (p.contactId) redirect(`/contacts/${p.contactId}`);

  const email = normalizeEmail(p.email);
  const bestaand = email
    ? await db.query.contacts.findFirst({
        where: sql`lower(${contacts.email}) = ${email}`,
        columns: { id: true },
      })
    : null;

  let contactId = bestaand?.id;
  if (!contactId) {
    const [c] = await db
      .insert(contacts)
      .values({
        // Zakelijk contact: de bedrijfsnaam is de weergavenaam.
        name: contactDisplayName({ companyName: p.companyName, email, isZakelijk: true }),
        firstName: p.contactPersonName ?? null,
        email,
        phone: p.phone ?? null,
        type,
        stage: "new",
        source: "leads-prospect",
        preferredLanguage: (p.country ?? "ES") === "ES" ? "es" : "en",
        addressLine: p.addressLine ?? null,
        postalCode: p.postalCode ?? null,
        city: p.city ?? null,
        province: p.province ?? null,
        country: p.country ?? "ES",
        tags: p.sector ? [p.sector] : p.tags ?? null,
        notes: [p.notes, p.website, p.lawfulBasisNote && `Herkomst: ${p.lawfulBasisNote}`]
          .filter(Boolean)
          .join("\n") || null,
      })
      .returning({ id: contacts.id });
    contactId = c.id;
  }

  await db
    .update(prospects)
    .set({ contactId, status: "converted", updatedAt: new Date() })
    .where(eq(prospects.id, id));

  // Vastleggen wáár dit contact vandaan komt — dat is straks de enige manier om
  // nog te achterhalen uit welke lijst iemand kwam.
  await db.insert(activities).values({
    type: "note",
    contactId,
    authorId: user.id,
    subject: "Uit leads gepromoveerd",
    body: `Prospect "${p.companyName}" is ${type === "customer" ? "klant" : "lead"} geworden.${
      p.lawfulBasisNote ? ` Herkomst: ${p.lawfulBasisNote}.` : ""
    }`,
  });

  revalidatePath("/leads/prospects");
  revalidatePath(`/contacts/${contactId}`);
  redirect(`/contacts/${contactId}`);
}
