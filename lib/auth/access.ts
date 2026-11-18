/**
 * De rol van de ingelogde gebruiker — uit de database, niet uit het cookie.
 *
 * De sessie is een JWT die 30 dagen leeft (`auth.ts`, `updateAge: 24h`). Wie
 * vandaag van rol wisselt, houdt in dat cookie dus nog een dag de oude rol.
 * Voor een tellertje is dat onschuldig, voor een toegangsgrens niet. Daarom
 * leest elke harde controle de rol hier op, en is `cache()` er zodat dat per
 * verzoek één query blijft, hoe vaak de layout, de pagina en de acties er ook
 * naar vragen.
 */
import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { type Capability, type ModuleKey, type Role, heeftCap, isLid, magModule, magPad, moduleVoorPad } from "@/lib/auth/modules";

export interface Toegang {
  id: string;
  email: string | null;
  name: string | null;
  /** De rol zoals die nu in de database staat. */
  rol: Role;
  /** Taal van het CRM voor deze medewerker ("nl" | "en" | "es"). */
  locale: string;
  magModule: (key: ModuleKey) => boolean;
  magPad: (pathname: string) => boolean;
  heeftCap: (cap: Capability) => boolean;
}

/**
 * Niet ingelogd → null. Een account dat intussen verwijderd is → ook null: de
 * sessie bestaat dan nog wel, maar het account niet meer.
 */
export const huidigeToegangOfNull = cache(async (): Promise<Toegang | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const rij = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { id: true, email: true, name: true, role: true, locale: true },
  });
  if (!rij) return null;

  const rol = rij.role as Role;
  return {
    id: rij.id,
    email: rij.email,
    name: rij.name,
    rol,
    locale: rij.locale ?? "nl",
    // Een module met een ledenlijst (de actielijst) kijkt ook naar het adres:
    // beheerder zijn is daar niet genoeg.
    magModule: (key) => magModule(rol, key) && isLid(key, rij.email),
    magPad: (pathname) => magPad(rol, pathname) && isLid(moduleVoorPad(pathname), rij.email),
    heeftCap: (cap) => heeftCap(rol, cap),
  };
});
