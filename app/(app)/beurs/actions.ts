"use server";

/**
 * Bezoeker van de beursstand vastleggen.
 *
 * Tot nu toe ging dat met visitekaartjes in een map en een handgeschreven
 * notitie erbij; bij het opvolgen blijkt dan dat het e-mailadres niet te lezen
 * is. Daarom ter plekke intypen, op de iPad, en meteen in het CRM.
 *
 * Eén invoer levert drie dingen op:
 *  1. een **contact** — daar zoek je ze later op, met de beurs als bron en de
 *     rol als tag, zodat architecten een andere opvolging kunnen krijgen dan
 *     wederverkopers;
 *  2. een **aanvraag** — die komt in de bestaande opvolglijst op /aanvragen
 *     terecht, met wat de bezoeker wil;
 *  3. een **bevestigingsmail** aan de bezoeker.
 *
 * De mail is bewust geen harde eis: gaat er op de beursvloer iets mis met de
 * verbinding, dan is de bezoeker nog steeds vastgelegd en zie je op het scherm
 * dat de mail niet gelukt is.
 */
import { and, eq, ilike, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireModule } from "@/lib/auth/guards";
import { BEURS, ROLLEN, beursMail, contactNotitie, contactSoort, rolLabel } from "@/lib/beurs";
import { COMPANY } from "@/lib/company";
import { brandedEmail, escapeHtml, sendEmail, signatureHtml } from "@/lib/email";
import { db } from "@/lib/db";
import { companies, contacts, quoteRequests } from "@/lib/db/schema";

const schema = z.object({
  naam: z.string().trim().min(2, "Naam is verplicht").max(160),
  email: z.string().trim().email("Geen geldig e-mailadres").max(200),
  telefoon: z.string().trim().max(60).optional().or(z.literal("")),
  bedrijf: z.string().trim().max(160).optional().or(z.literal("")),
  rol: z.enum(ROLLEN.map((r) => r.key) as [string, ...string[]]),
  taal: z.enum(["nl", "en", "es"]),
  wens: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type BeursResultaat =
  | { ok: true; naam: string; mail: "verstuurd" | "mislukt" }
  | { ok: false; fout: string };

export async function legBezoekerVast(formData: FormData): Promise<BeursResultaat> {
  await requireModule("aanvragen");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, fout: parsed.error.issues.map((i) => i.message).join(" · ") };
  }
  const d = parsed.data;
  const email = d.email.toLowerCase();
  const bedrijf = d.bedrijf?.trim() || null;

  // Bedrijf: bestaande naam hergebruiken, anders aanmaken. Een architectenbureau
  // is een bedrijf, ook als we er nog niets mee gedaan hebben.
  let companyId: string | null = null;
  if (bedrijf) {
    const bestaand = await db.query.companies.findFirst({
      where: ilike(companies.name, bedrijf),
      columns: { id: true },
    });
    if (bestaand) companyId = bestaand.id;
    else {
      const [nieuw] = await db
        .insert(companies)
        .values({ name: bedrijf, type: "client" })
        .returning({ id: companies.id });
      companyId = nieuw.id;
    }
  }

  const tags = [BEURS.bron, `rol:${d.rol}`];
  const notitie = contactNotitie({ rol: d.rol, bedrijf, wens: d.wens });

  // Kennen we dit e-mailadres al? Dan de bestaande kaart bijwerken in plaats van
  // een tweede aanmaken — op een beurs staat er zo maar een bekende klant voor je.
  const bestaandContact = await db.query.contacts.findFirst({
    where: sql`lower(${contacts.email}) = ${email}`,
    columns: { id: true, tags: true, notes: true, type: true },
  });

  let contactId: string;
  if (bestaandContact) {
    const samen = [...new Set([...(bestaandContact.tags ?? []), ...tags])];
    await db
      .update(contacts)
      .set({
        phone: d.telefoon?.trim() || undefined,
        companyId: companyId ?? undefined,
        tags: samen,
        notes: [bestaandContact.notes, notitie].filter(Boolean).join("\n\n"),
        preferredLanguage: d.taal,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, bestaandContact.id));
    contactId = bestaandContact.id;
  } else {
    const [nieuw] = await db
      .insert(contacts)
      .values({
        name: d.naam,
        email,
        phone: d.telefoon?.trim() || null,
        companyId,
        type: contactSoort(d.rol),
        source: BEURS.bron,
        tags,
        notes: notitie,
        preferredLanguage: d.taal,
      })
      .returning({ id: contacts.id });
    contactId = nieuw.id;
  }

  await db.insert(quoteRequests).values({
    name: d.naam,
    email,
    phone: d.telefoon?.trim() || null,
    company: bedrijf,
    kind: "contact",
    source: BEURS.bron,
    locale: d.taal,
    contactId,
    message: [
      `${rolLabel(d.rol)} — gesproken op ${BEURS.naam}, stand ${BEURS.stand}`,
      d.wens?.trim() ? `\n${d.wens.trim()}` : "",
    ]
      .join("")
      .trim(),
  });

  // Bevestiging naar de bezoeker.
  let mail: "verstuurd" | "mislukt" = "mislukt";
  try {
    const tekst = beursMail({ naam: d.naam, taal: d.taal, wens: d.wens });
    const res = await sendEmail({
      to: email,
      subject: tekst.subject,
      html: brandedEmail(
        tekst.alineas.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n") +
          `<hr style="border:none;border-top:1px solid #e7e2d8;margin:24px 0 16px" />
           <p style="margin:0 0 4px">${escapeHtml(tekst.groet)}</p>
           <div style="font-size:13px;color:#888;line-height:1.7">${signatureHtml()}</div>`,
      ),
      text: `${tekst.alineas.join("\n\n")}\n\n${tekst.groet}\n${COMPANY.legalName}`,
    });
    if (res.sent) mail = "verstuurd";
  } catch {
    mail = "mislukt";
  }

  revalidatePath("/beurs");
  revalidatePath("/aanvragen");
  revalidatePath("/contacts");
  return { ok: true, naam: d.naam, mail };
}
