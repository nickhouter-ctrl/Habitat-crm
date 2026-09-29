import "server-only";

/**
 * Een beursbezoeker wegschrijven — het stuk dat twee kanten delen.
 *
 * Op de stand tikt iemand van ons de gegevens in (`/beurs`, achter de login);
 * scant een bezoeker de QR-code, dan vult hij ze zelf in op onze eigen website
 * en komt het via `/api/beurs` binnen. Wat er daarna gebeurt moet in beide
 * gevallen precies hetzelfde zijn: één contact, één aanvraag in de opvolglijst
 * en één bevestigingsmail. Daarom staat dat hier, en niet twee keer.
 *
 * De mail is bewust geen harde eis: gaat er iets mis met de verbinding naar de
 * mailserver, dan is de bezoeker nog steeds vastgelegd.
 */
import { eq, ilike, sql } from "drizzle-orm";

import {
  BEURS,
  bepaalTier,
  beursMail,
  contactNotitie,
  contactSoort,
  interesseLabel,
  rolOmschrijving,
  schoonInteresses,
} from "@/lib/beurs";
import { zetBeursAccountKlaar } from "@/lib/beurs-account";
import { zoekCoordinaten } from "@/lib/geocode-plaats";
import { leesPlaats } from "@/lib/plaats";
import type { BeursTaal } from "@/lib/beurs";
import { COMPANY } from "@/lib/company";
import { db } from "@/lib/db";
import { companies, contacts, quoteRequests } from "@/lib/db/schema";
import { brandedEmail, escapeHtml, sendEmail, signatureHtml } from "@/lib/email";

export interface BeursBezoeker {
  naam: string;
  email: string;
  telefoon?: string | null;
  bedrijf?: string | null;
  rol: string;
  /** Bij rol "anders": wat het dan wél is. */
  rolAnders?: string | null;
  /** Aangevinkt: stalen, prijzen, beeld, showroombezoek. */
  interesses?: readonly string[] | null;
  /** Stad van de bezoeker ("Valencia"). */
  plaats?: string | null;
  /** Landcode uit de keuzelijst ("ES"). */
  land?: string | null;
  taal: BeursTaal;
  wens?: string | null;
  /** Heeft de bezoeker het zelf ingevuld (QR-code) of wij op de iPad? */
  zelfIngevuld?: boolean;
}

export interface BeursOpslagResultaat {
  contactId: string;
  aanvraagId: string;
  mail: "verstuurd" | "mislukt";
  /** Kreeg de bezoeker een uitnodiging voor een website-account, en zo ja welke? */
  account: "particulier" | "aannemer" | "bestond al" | "mislukt";
}

export async function slaBeursbezoekerOp(d: BeursBezoeker): Promise<BeursOpslagResultaat> {
  const email = d.email.trim().toLowerCase();
  const bedrijf = d.bedrijf?.trim() || null;
  const telefoon = d.telefoon?.trim() || null;
  const wens = d.wens?.trim() || null;

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

  // Waar de bezoeker zit: stad uit het tekstveld, land uit de keuzelijst. De
  // coördinaten zoeken we hier één keer op, dan hoeft de kaart later niets meer
  // te doen. Wordt de stad niet gevonden, dan staat de bezoeker gewoon zonder
  // speldje in de lijst — dat mag het invoeren niet ophouden.
  const plaats = leesPlaats(d.plaats, d.land);
  const punt = plaats?.plaats ? await zoekCoordinaten(plaats.plaats, plaats.land) : null;

  const rolAnders = d.rol === "anders" ? d.rolAnders?.trim() || null : null;
  const interesses = schoonInteresses(d.interesses);
  const tags = [BEURS.bron, `rol:${d.rol}`, ...interesses.map((k) => `wil:${k}`)];
  if (d.zelfIngevuld) tags.push("beurs:qr");
  // Wat "anders" precies is hoort bij de rol, niet in de vrije tekst: zo staat
  // het ook in de lijst en in de download, en niet alleen in de notitie.
  if (rolAnders) tags.push(`rol-anders:${rolAnders}`);
  const notitie = contactNotitie({ rol: d.rol, bedrijf, wens, rolAnders, interesses });

  // Kennen we dit e-mailadres al? Dan de bestaande kaart bijwerken in plaats van
  // een tweede aanmaken — op een beurs staat er zomaar een bekende klant voor je.
  const bestaandContact = await db.query.contacts.findFirst({
    where: sql`lower(${contacts.email}) = ${email}`,
    columns: { id: true, tags: true, notes: true, type: true, city: true },
  });

  let contactId: string;
  if (bestaandContact) {
    const samen = [...new Set([...(bestaandContact.tags ?? []), ...tags])];
    await db
      .update(contacts)
      .set({
        phone: telefoon ?? undefined,
        companyId: companyId ?? undefined,
        // Een bekende klant heeft vaak al een adres — dat is beter dan wat er
        // op een beursvloer wordt ingetikt, dus alleen invullen wat leeg is.
        city: bestaandContact.city?.trim() ? undefined : plaats?.plaats || undefined,
        country: bestaandContact.city?.trim() ? undefined : plaats?.land ?? undefined,
        latitude: !bestaandContact.city?.trim() && punt ? String(punt.lat) : undefined,
        longitude: !bestaandContact.city?.trim() && punt ? String(punt.lon) : undefined,
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
        name: d.naam.trim(),
        email,
        phone: telefoon,
        companyId,
        type: contactSoort(d.rol),
        source: BEURS.bron,
        city: plaats?.plaats || null,
        country: plaats?.land ?? undefined,
        latitude: punt ? String(punt.lat) : null,
        longitude: punt ? String(punt.lon) : null,
        tags,
        notes: notitie,
        preferredLanguage: d.taal,
      })
      .returning({ id: contacts.id });
    contactId = nieuw.id;
  }

  const [aanvraag] = await db
    .insert(quoteRequests)
    .values({
      name: d.naam.trim(),
      email,
      phone: telefoon,
      company: bedrijf,
      kind: "contact",
      source: BEURS.bron,
      locale: d.taal,
      contactId,
      message: [
        `${rolOmschrijving(d.rol, rolAnders)} — ${d.zelfIngevuld ? "zelf ingevuld via de QR-code op" : "gesproken op"} ${BEURS.naam}, stand ${BEURS.stand}`,
        interesses.length ? `\nWil: ${interesses.map((k) => interesseLabel(k)).join(", ")}` : "",
        wens ? `\n${wens}` : "",
      ]
        .join("")
        .trim(),
    })
    .returning({ id: quoteRequests.id });

  // Account op de website. De goedkeuring is al gebeurd — aan de stand, in een
  // gesprek — dus krijgt de bezoeker de wachtwoordlink meteen mee. Mislukt het,
  // dan gaat de bevestigingsmail zonder knop de deur uit.
  let account: BeursOpslagResultaat["account"] = "mislukt";
  let activatieLink: string | null = null;
  try {
    const tier = bepaalTier({ rol: d.rol, bedrijf, zelfIngevuld: d.zelfIngevuld });
    const res = await zetBeursAccountKlaar({
      email,
      naam: d.naam,
      contactId,
      bedrijf,
      taal: d.taal,
      tier,
    });
    activatieLink = res.activatieLink;
    account = res.activatieLink ? res.tier : "bestond al";
  } catch (err) {
    console.warn("[beurs] account klaarzetten mislukt:", err);
  }

  // Bevestiging naar de bezoeker.
  let mail: "verstuurd" | "mislukt" = "mislukt";
  try {
    const tekst = beursMail({ naam: d.naam, taal: d.taal, wens, interesses, accountLink: activatieLink });
    const res = await sendEmail({
      to: email,
      subject: tekst.subject,
      html: brandedEmail(
        tekst.alineas.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n") +
          (tekst.account
            ? `<p>${escapeHtml(tekst.account.tekst)}</p>
               <p style="margin:22px 0"><a href="${tekst.account.link}" style="background:#b5532b;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:14px">${escapeHtml(tekst.account.knop)}</a></p>`
            : "") +
          `<hr style="border:none;border-top:1px solid #e7e2d8;margin:24px 0 16px" />
           <p style="margin:0 0 4px">${escapeHtml(tekst.groet)}</p>
           <div style="font-size:13px;color:#888;line-height:1.7">${signatureHtml()}</div>`,
      ),
      text: `${tekst.alineas.join("\n\n")}${
        tekst.account ? `\n\n${tekst.account.tekst}\n${tekst.account.link}` : ""
      }\n\n${tekst.groet}\n${COMPANY.legalName}`,
    });
    if (res.sent) mail = "verstuurd";
  } catch {
    mail = "mislukt";
  }

  return { contactId, aanvraagId: aanvraag.id, mail, account };
}
