"use server";

/**
 * Nabellen na een campagne: één belpoging vastleggen, en bij een afspraak in
 * dezelfde handeling het contact aanmaken en de agenda vullen.
 *
 * Waarom dat samen gaat: tijdens het bellen typ je één keer en daarna hoort het
 * gewoon te staan. Anders blijft een toezegging in een notitieveld hangen en
 * ziet niemand de afspraak in de agenda.
 */

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireModule } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { activities, appointments, contacts, prospectCalls, prospects } from "@/lib/db/schema";
import { contactDisplayName } from "@/lib/contact-name";
import { normalizeEmail } from "@/lib/leads/normalize";

const UITKOMSTEN = ["geen-antwoord", "terugbellen", "interesse", "afspraak", "geen-interesse", "verkeerd-nummer"] as const;
type Uitkomst = (typeof UITKOMSTEN)[number];

const LABEL: Record<Uitkomst, string> = {
  "geen-antwoord": "Geen antwoord",
  terugbellen: "Terugbellen",
  interesse: "Interesse",
  afspraak: "Afspraak",
  "geen-interesse": "Geen interesse",
  "verkeerd-nummer": "Verkeerd nummer",
};

export type BelResultaat = { ok: true; contactId?: string; melding: string } | { ok: false; melding: string };

/**
 * Maakt (of hergebruikt) het contact bij een prospect. Zelfde regels als het
 * promoveren op de prospectlijst: bestaat er al een contact met dit e-mailadres,
 * dan hangen we eraan in plaats van een tweede aan te maken.
 */
async function zorgVoorContact(prospectId: string, userId: string): Promise<string | null> {
  const p = await db.query.prospects.findFirst({ where: eq(prospects.id, prospectId) });
  if (!p) return null;
  if (p.contactId) return p.contactId;

  const email = normalizeEmail(p.email);
  const bestaand = email
    ? await db.query.contacts.findFirst({ where: sql`lower(${contacts.email}) = ${email}`, columns: { id: true } })
    : null;

  let contactId = bestaand?.id;
  if (!contactId) {
    const [c] = await db
      .insert(contacts)
      .values({
        name: contactDisplayName({ companyName: p.companyName, email, isZakelijk: true }),
        firstName: p.contactPersonName ?? null,
        email,
        phone: p.phone ?? null,
        type: "lead",
        stage: "new",
        source: "broadcast-nabellen",
        preferredLanguage: (p.country ?? "ES") === "ES" ? "es" : "en",
        addressLine: p.addressLine ?? null,
        postalCode: p.postalCode ?? null,
        city: p.city ?? null,
        province: p.province ?? null,
        country: p.country ?? "ES",
        tags: p.sector ? [p.sector] : (p.tags ?? null),
        notes: [p.notes, p.website].filter(Boolean).join("\n") || null,
      })
      .returning({ id: contacts.id });
    contactId = c.id;
  }

  await db.update(prospects).set({ contactId, updatedAt: new Date() }).where(eq(prospects.id, prospectId));
  await db.insert(activities).values({
    type: "note",
    contactId,
    authorId: userId,
    subject: "Uit de nabellijst",
    body: `Prospect "${p.companyName}" is na een telefoongesprek een contact geworden.`,
  });
  return contactId;
}

export async function legBelpogingVast(formData: FormData): Promise<BelResultaat> {
  const user = await requireModule("broadcast");
  const prospectId = String(formData.get("prospectId") ?? "");
  const uitkomst = String(formData.get("outcome") ?? "") as Uitkomst;
  const note = String(formData.get("note") ?? "").trim();
  const wanneer = String(formData.get("startsAt") ?? "").trim(); // "2026-09-24T10:30" uit datetime-local
  const duurMin = Number(formData.get("duurMin") ?? 60) || 60;
  const plaats = String(formData.get("location") ?? "").trim();

  if (!prospectId || !UITKOMSTEN.includes(uitkomst)) return { ok: false, melding: "Kies eerst een uitkomst." };

  const p = await db.query.prospects.findFirst({ where: eq(prospects.id, prospectId) });
  if (!p) return { ok: false, melding: "Deze prospect bestaat niet meer." };

  // Een afspraak zonder moment is geen afspraak.
  if (uitkomst === "afspraak" && !wanneer) return { ok: false, melding: "Vul datum en tijd van de afspraak in." };

  await db.insert(prospectCalls).values({
    prospectId,
    outcome: uitkomst,
    note: note || null,
    userId: user.id,
  });

  let contactId: string | null = null;
  let melding = `${LABEL[uitkomst]} vastgelegd.`;

  if (uitkomst === "afspraak" || uitkomst === "interesse") {
    contactId = await zorgVoorContact(prospectId, user.id);
    melding = contactId ? `${LABEL[uitkomst]} vastgelegd, contact aangemaakt.` : melding;
  }

  if (uitkomst === "afspraak" && contactId) {
    const start = new Date(wanneer);
    if (Number.isNaN(start.getTime())) return { ok: false, melding: "Die datum begreep ik niet." };
    await db.insert(appointments).values({
      title: `Gesprek ${p.companyName}`,
      contactId,
      startsAt: start,
      endsAt: new Date(start.getTime() + duurMin * 60_000),
      location: plaats || null,
      notes: [note, p.phone ? `Telefoon: ${p.phone}` : null].filter(Boolean).join("\n") || null,
      status: "scheduled",
      assigneeId: user.id,
      createdBy: user.id,
    });
    await db.insert(activities).values({
      type: "call",
      contactId,
      authorId: user.id,
      subject: "Afspraak gemaakt via nabellen",
      body: [`Afspraak op ${start.toLocaleString("nl-NL", { timeZone: "Europe/Madrid" })}`, plaats && `Plaats: ${plaats}`, note]
        .filter(Boolean)
        .join("\n"),
    });
    melding = "Afspraak staat in de agenda en het contact is aangemaakt.";
  } else if (contactId) {
    await db.insert(activities).values({
      type: "call",
      contactId,
      authorId: user.id,
      subject: `Telefoongesprek: ${LABEL[uitkomst]}`,
      body: note || null,
    });
  }

  // Statussen die iets zeggen; "geen antwoord" laat de prospect in de lijst staan.
  const nieuweStatus =
    uitkomst === "afspraak"
      ? "converted"
      : uitkomst === "interesse"
        ? "replied"
        : uitkomst === "geen-interesse" || uitkomst === "verkeerd-nummer"
          ? "skipped"
          : null;
  if (nieuweStatus) {
    await db.update(prospects).set({ status: nieuweStatus, updatedAt: new Date() }).where(eq(prospects.id, prospectId));
  }

  revalidatePath("/broadcast/nabellen");
  revalidatePath("/broadcast");
  if (contactId) revalidatePath(`/contacts/${contactId}`);
  return { ok: true, contactId: contactId ?? undefined, melding };
}
