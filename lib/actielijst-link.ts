/**
 * Persoonlijke links naar de actielijst — openen zonder inloggen.
 *
 * Dezelfde opzet als het urenportaal (`lib/worker-portal.ts`): het token ín de
 * URL is de sleutel. Daarom:
 *  - het token is 32 willekeurige bytes, niet te raden en niet oplopend;
 *  - de pagina is noindex en stuurt geen referrer, zodat de link niet uitlekt;
 *  - een link werkt alleen zolang de medewerker op de ledenlijst van de module
 *    staat en mag wijzigen. Haal iemand van die lijst en zijn link is dood;
 *  - één rij per medewerker: een nieuwe link maken overschrijft het token, dus
 *    de oude link is op datzelfde moment ongeldig.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { actionListLinks, users } from "@/lib/db/schema";
import { heeftCap, magModuleAls } from "@/lib/auth/modules";
import { crmUrl } from "@/lib/crm-url";

const TOKEN_VORM = /^[A-Za-z0-9_-]{20,128}$/;

export function nieuwActielijstToken(): string {
  return randomBytes(32).toString("base64url");
}

export function actielijstLinkUrl(token: string): string {
  return `${crmUrl()}/lijst/${token}`;
}

/** Wie hoort er bij de actielijst? Uitsluitend deze mensen krijgen een link. */
export async function actielijstLeden() {
  const team = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, locale: users.locale }).from(users).orderBy(asc(users.name));
  return team.filter(u => magModuleAls(u.role, u.email, "actielijst") && heeftCap(u.role, "schrijven"));
}

/**
 * De medewerker achter een token, of null bij een onbekende, ingetrokken of
 * inmiddels niet meer toegestane link. Null is hier bewust niet
 * onderscheidend: een ongeldige link krijgt altijd hetzelfde antwoord.
 */
export async function actielijstLinkVoorToken(token: string) {
  if (!TOKEN_VORM.test(token)) return null;
  const [rij] = await db.select({ linkId: actionListLinks.id, token: actionListLinks.token, userId: users.id, name: users.name, email: users.email, role: users.role })
    .from(actionListLinks).innerJoin(users, eq(users.id, actionListLinks.userId)).where(eq(actionListLinks.token, token)).limit(1);
  if (!rij) return null;
  return magModuleAls(rij.role, rij.email, "actielijst") && heeftCap(rij.role, "schrijven") ? rij : null;
}

/** Stil bijhouden of de link gebruikt wordt; een fout hier mag de pagina niet breken. */
export async function noteerActielijstBezoek(linkId: string): Promise<void> {
  await db.update(actionListLinks).set({ lastSeenAt: new Date() }).where(eq(actionListLinks.id, linkId)).catch(() => {});
}

/** Iedereen op de ledenlijst een link geven, zonder bestaande links te raken. */
export async function zorgVoorActielijstLinks() {
  const leden = await actielijstLeden();
  if (leden.length) {
    await db.insert(actionListLinks).values(leden.map(lid => ({ userId: lid.id, token: nieuwActielijstToken() }))).onConflictDoNothing();
  }
  const links = leden.length
    ? await db.select({ id: actionListLinks.id, userId: actionListLinks.userId, token: actionListLinks.token, lastSeenAt: actionListLinks.lastSeenAt }).from(actionListLinks).where(inArray(actionListLinks.userId, leden.map(l => l.id)))
    : [];
  return leden.map(lid => {
    const link = links.find(l => l.userId === lid.id);
    return { ...lid, link: link ? { ...link, url: actielijstLinkUrl(link.token) } : null };
  });
}

/** Nieuwe link voor één medewerker; de oude is daarna direct ongeldig. */
export async function vernieuwActielijstLink(userId: string): Promise<string | null> {
  const leden = await actielijstLeden();
  if (!leden.some(l => l.id === userId)) return null;
  const token = nieuwActielijstToken();
  const [rij] = await db.insert(actionListLinks).values({ userId, token })
    .onConflictDoUpdate({ target: actionListLinks.userId, set: { token, lastSeenAt: null, updatedAt: new Date() } })
    .returning({ token: actionListLinks.token });
  return rij ? actielijstLinkUrl(rij.token) : null;
}
