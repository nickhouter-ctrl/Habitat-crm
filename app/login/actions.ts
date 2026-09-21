"use server";

/**
 * "Stuur mij een inloglink" op het inlogscherm.
 *
 * Waarom dit er is: niemand kon zijn eigen wachtwoord herstellen. Elke keer dat
 * iemand niet binnenkwam moest een beheerder in Instellingen → Medewerkers een
 * nieuw wachtwoord zetten en dat doorgeven — met alle misverstanden die daarbij
 * horen. De mailbox is hier de sleutel: wie bij het postvak kan, is het ook.
 *
 * Drie regels die deze knop veilig houden:
 *  1. **Altijd dezelfde melding.** Onbekend adres, bekend adres, rem eroverheen:
 *     het scherm zegt precies hetzelfde. Anders is dit een lijstje waarmee je
 *     kunt aflezen wie hier een account heeft.
 *  2. **Rem per IP én per adres, fail-closed.** Zonder dat is het een knop
 *     waarmee iemand andermans postvak kan volgooien.
 *  3. **Geen bedrijfs-BCC.** De standaard-BCC zet nick@, frederique@ en hi@ op
 *     elke uitgaande mail; een persoonlijke inloglink hoort niet in een
 *     gedeeld postvak te liggen. Daarom `noCompanyBcc: true`.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { crmUrl } from "@/lib/crm-url";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { brandedEmail, escapeHtml, sendEmail } from "@/lib/email";
import { isLocale, maakT } from "@/lib/i18n";
import { maakZelfAangevraagdeLink, ZELF_GELDIG_MINUTEN } from "@/lib/login-links";
import { clientIpFromHeaders, rateLimitDetail } from "@/lib/rate-limit";

/** Max. 5 aanvragen per kwartier vanaf één IP, 3 per uur per adres. */
const IP_MAX = 5;
const IP_VENSTER = 15 * 60;
const ADRES_MAX = 3;
const ADRES_VENSTER = 60 * 60;

export async function vraagInloglink(formData: FormData) {
  const adres = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  // Leeg of geen e-mailadres: dat is geen poging, dat is een vergeten veld.
  // Hier mág het scherm dus wel iets anders zeggen — het verklapt niets.
  if (!z.string().email().safeParse(adres).success) redirect("/login?link=leeg");

  const ip = clientIpFromHeaders(await headers());
  const [perIp, perAdres] = await Promise.all([
    rateLimitDetail(`inloglink:ip:${ip}`, IP_MAX, IP_VENSTER, { strikt: true }),
    rateLimitDetail(`inloglink:email:${adres}`, ADRES_MAX, ADRES_VENSTER, { strikt: true }),
  ]);

  // Boven de rem: stil niets doen. De melding blijft dezelfde, want ook een
  // afwijkend "te veel aanvragen" zou verklappen dat hier iets gebeurde.
  if (perIp.ok && perAdres.ok) {
    const gebruiker = await db.query.users.findFirst({
      where: sql`lower(${users.email}) = ${adres}`,
      columns: { id: true, name: true, email: true, locale: true },
    });
    if (gebruiker) {
      const token = await maakZelfAangevraagdeLink(gebruiker.id);
      const t = maakT(isLocale(gebruiker.locale) ? gebruiker.locale : "nl");
      const url = `${crmUrl()}/login/link/${token}`;
      const aanhef = gebruiker.name?.trim()
        ? t("Hallo {naam},", { naam: gebruiker.name.trim() })
        : t("Hallo,");
      const uitleg = t(
        "Klik op de knop om in te loggen. De link is {minuten} minuten geldig en werkt één keer.",
        { minuten: ZELF_GELDIG_MINUTEN },
      );
      const persoonlijk = t("Deze link is persoonlijk — stuur hem niet door.");
      const nietAangevraagd = t(
        "Heb je dit niet aangevraagd? Dan hoef je niets te doen; er is niets veranderd en je wachtwoord werkt nog.",
      );

      await sendEmail({
        to: gebruiker.email,
        subject: t("Je inloglink voor het CRM"),
        // Geen bedrijfskopie: zie de kop van dit bestand.
        noCompanyBcc: true,
        html: brandedEmail(`
          <p>${escapeHtml(aanhef)}</p>
          <p>${escapeHtml(uitleg)}</p>
          <p style="margin:22px 0">
            <a href="${url}" style="display:inline-block;padding:11px 20px;background:#3a2a20;color:#fff;border-radius:6px;text-decoration:none;font-size:14px">${escapeHtml(t("Inloggen"))}</a>
          </p>
          <p style="font-size:13px;color:#7a6f63">${escapeHtml(persoonlijk)}</p>
          <p style="font-size:13px;color:#7a6f63">${escapeHtml(nietAangevraagd)}</p>
        `),
        text: [aanhef, "", uitleg, "", url, "", persoonlijk, nietAangevraagd].join("\n"),
      });
    }
  }

  redirect("/login?link=verstuurd");
}
