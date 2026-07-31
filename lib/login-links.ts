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
 */
import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

import { db } from "@/lib/db";
import { loginTokens, users } from "@/lib/db/schema";

const GELDIG_DAGEN = 30;

/**
 * Geeft een geldige inloglink voor deze gebruiker: hergebruikt een bestaande
 * token die nog ruim geldig is, zodat links in oudere mails blijven werken.
 */
export async function getLoginToken(userId: string, purpose: string): Promise<string> {
  const bestaand = await db.query.loginTokens.findFirst({
    where: and(
      eq(loginTokens.userId, userId),
      eq(loginTokens.purpose, purpose),
      // Nog minstens een week te gaan: anders liever een verse.
      gt(loginTokens.expiresAt, new Date(Date.now() + 7 * 86_400_000)),
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
    })
    .from(loginTokens)
    .innerJoin(users, eq(users.id, loginTokens.userId))
    .where(eq(loginTokens.token, token))
    .limit(1);
  const u = rij[0];
  if (!u) return null;
  if (u.expiresAt.getTime() < Date.now()) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

/** Stempelt het gebruik, zodat je in de database kunt zien of een link leeft. */
export async function markLoginTokenUsed(token: string): Promise<void> {
  await db.update(loginTokens).set({ lastUsedAt: new Date(), updatedAt: new Date() }).where(eq(loginTokens.token, token));
}
