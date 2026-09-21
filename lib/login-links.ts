/**
 * Inloggen vanuit een mail: één klik in plaats van je wachtwoord opzoeken.
 *
 * Waarom dit veilig genoeg is voor dit CRM, en waar de grens ligt:
 *  - De link logt NIET in bij het openen. Mailscanners van Gmail en Outlook
 *    halen links vooraf op om ze te controleren; een GET die inlogt zou een
 *    sessie voor die scanner aanmaken. De link opent een pagina met één knop.
 *  - De token is 30 dagen geldig en herbruikbaar. Eenmalig gebruik klinkt
 *    veiliger maar breekt in de praktijk: de ochtendmail blijft dan met een
 *    dode link staan zodra je 'm één keer hebt gebruikt.
 *  - Wie de mail doorstuurt, geeft toegang tot dat account weg. Dat is de
 *    bekende keerzijde van elke inloglink; daarom staat er in de mail bij dat
 *    de link persoonlijk is.
 *
 * Er is één soort link waarvoor het omgekeerde geldt: de link die iemand ZELF
 * aanvraagt op het inlogscherm (`ZELF_AANGEVRAAGD`). Die is een
 * wachtwoordherstel en dus de enige sleutel op dat moment — hij leeft 30
 * minuten en werkt één keer. Hergebruik zou betekenen dat een half jaar later
 * iemand die de mail nog in zijn postvak heeft staan alsnog binnenkomt.
 */
import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

import { db } from "@/lib/db";
import { loginTokens, users } from "@/lib/db/schema";

const GELDIG_DAGEN = 7;

/** Purpose van een link die iemand zelf aanvroeg op het inlogscherm. */
export const ZELF_AANGEVRAAGD = "zelf-aangevraagd";
/** Kort geldig: dit is wachtwoordherstel, geen gemak in een ochtendmail. */
export const ZELF_GELDIG_MINUTEN = 30;

/**
 * Verse, eenmalige inloglink voor wie er zelf om vraagt.
 *
 * Bewust NIET via `getLoginToken()`: die hergebruikt een bestaande token en
 * geeft 7 dagen, wat voor een meldingsmail prima is en voor wachtwoordherstel
 * niet. Elke aanvraag krijgt hier dus een eigen token; de vorige blijft geldig
 * tot zijn eigen einddatum, zodat twee keer klikken geen dode link oplevert.
 */
export async function maakZelfAangevraagdeLink(userId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await db.insert(loginTokens).values({
    userId,
    token,
    purpose: ZELF_AANGEVRAAGD,
    expiresAt: new Date(Date.now() + ZELF_GELDIG_MINUTEN * 60_000),
  });
  return token;
}

/**
 * Geeft een geldige inloglink voor deze gebruiker: hergebruikt een bestaande
 * token die nog ruim geldig is, zodat links in oudere mails blijven werken.
 */
export async function getLoginToken(userId: string, purpose: string): Promise<string> {
  const bestaand = await db.query.loginTokens.findFirst({
    where: and(
      eq(loginTokens.userId, userId),
      eq(loginTokens.purpose, purpose),
      // Nog minstens twee dagen te gaan: anders liever een verse.
      gt(loginTokens.expiresAt, new Date(Date.now() + 2 * 86_400_000)),
    ),
    columns: { token: true },
  });
  if (bestaand) return bestaand.token;

  const token = randomBytes(24).toString("base64url");
  await db.insert(loginTokens).values({
    userId,
    token,
    purpose,
    expiresAt: new Date(Date.now() + GELDIG_DAGEN * 86_400_000),
  });
  return token;
}

/** Rol overnemen zoals de database 'm kent (admin | agent | viewer). */
type Rol = (typeof users.$inferSelect)["role"];
export type LoginTokenUser = { id: string; name: string | null; email: string; role: Rol };

/** Token → gebruiker, mits niet verlopen. Geeft null bij een onbekende token. */
export async function resolveLoginToken(token: string): Promise<LoginTokenUser | null> {
  if (!token || token.length < 20) return null;
  const rij = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      expiresAt: loginTokens.expiresAt,
      purpose: loginTokens.purpose,
      lastUsedAt: loginTokens.lastUsedAt,
    })
    .from(loginTokens)
    .innerJoin(users, eq(users.id, loginTokens.userId))
    .where(eq(loginTokens.token, token))
    .limit(1);
  const u = rij[0];
  if (!u) return null;
  if (u.expiresAt.getTime() < Date.now()) return null;
  // Een zelf aangevraagde link is eenmalig; de links uit meldingsmail blijven
  // bewust herbruikbaar (anders staat de ochtendmail vol dode links).
  if (u.purpose === ZELF_AANGEVRAAGD && u.lastUsedAt) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

/** Stempelt het gebruik, zodat je in de database kunt zien of een link leeft. */
export async function markLoginTokenUsed(token: string): Promise<void> {
  await db.update(loginTokens).set({ lastUsedAt: new Date(), updatedAt: new Date() }).where(eq(loginTokens.token, token));
}
