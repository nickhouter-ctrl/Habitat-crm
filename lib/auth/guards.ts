/**
 * Centrale guards voor server actions en routes.
 *
 * Drie vragen, drie functies:
 *   `requireWriteUser()`   mag deze gebruiker überhaupt wijzigen? (viewer niet)
 *   `requireModule(m)`     mag deze gebruiker bij deze module?
 *   `requireCapability(c)` mag deze gebruiker bedragen zien / het team beheren?
 *
 * Alle drie lezen de rol uit de database (`lib/auth/access.ts`), niet uit het
 * sessiecookie: dat cookie leeft 30 dagen en kan dus een oude rol bevatten.
 * Binnen één verzoek is dat door `cache()` nog steeds één query.
 *
 * Wie mag wat staat in `lib/auth/modules.ts` — daar, en alleen daar.
 */
import "server-only";
import { redirect } from "next/navigation";

import { huidigeToegangOfNull, type Toegang } from "@/lib/auth/access";
import { type Capability, type ModuleKey, MODULES } from "@/lib/auth/modules";

export type SessionUser = { id: string; role?: string; name?: string | null; email?: string | null };

const GEEN_TOEGANG = "Geen toegang: dit onderdeel hoort niet bij jouw rol.";

/** Ingelogd, punt. Geeft de toegang mee zodat de aanroeper niets hoeft te herhalen. */
export async function requireToegang(): Promise<Toegang> {
  const t = await huidigeToegangOfNull();
  if (!t) redirect("/login");
  return t;
}

/** Ingelogd + mag muteren (rol ≠ viewer). Gebruik in alle server actions. */
export async function requireWriteUser(): Promise<SessionUser> {
  const t = await requireToegang();
  if (!t.heeftCap("schrijven")) {
    throw new Error("Alleen-lezen account: wijzigingen zijn niet toegestaan voor de rol 'viewer'.");
  }
  return { id: t.id, role: t.rol, name: t.name, email: t.email };
}

/**
 * Mag wijzigen én hoort bij deze module. Dit is de guard voor server actions:
 * één regel per `actions.ts`, en een rol die de module niet heeft krijgt een
 * fout in plaats van stilzwijgend succes.
 */
export async function requireModule(module: ModuleKey): Promise<SessionUser> {
  const t = await requireToegang();
  if (!t.magModule(module)) throw new Error(GEEN_TOEGANG);
  if (!t.heeftCap("schrijven")) {
    throw new Error("Alleen-lezen account: wijzigingen zijn niet toegestaan voor de rol 'viewer'.");
  }
  return { id: t.id, role: t.rol, name: t.name, email: t.email };
}

/** Alleen lezen binnen een module — voor pagina's en exports zonder mutatie. */
export async function requireModuleRead(module: ModuleKey): Promise<Toegang> {
  const t = await requireToegang();
  if (!t.magModule(module)) throw new Error(GEEN_TOEGANG);
  return t;
}

/** Een mogelijkheid in plaats van een module: bedragen, schrijven, teambeheer. */
export async function requireCapability(cap: Capability): Promise<Toegang> {
  const t = await requireToegang();
  if (!t.heeftCap(cap)) throw new Error(GEEN_TOEGANG);
  return t;
}

/** Beheerder — voor medewerkersbeheer, sleutels en webhooks. */
export async function requireAdmin(): Promise<Toegang> {
  return requireCapability("teambeheer");
}

/**
 * Voor routes zonder layout (PDF's, exports): geen uitzondering maar een
 * redirect naar de startpagina, want een `throw` in een route geeft een
 * 500-pagina in plaats van een nette omleiding.
 */
export async function guardRoute(module: ModuleKey): Promise<Toegang | Response> {
  const t = await huidigeToegangOfNull();
  if (!t) return Response.redirect(new URL("/login", process.env.APP_URL ?? "http://localhost:3000"));
  if (!t.magModule(module)) {
    return new Response(GEEN_TOEGANG, { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return t;
}

/** Zodat de zijbalk en de startpagina dezelfde labels gebruiken als de guards. */
export const MODULE_LABELS: Record<string, string> = Object.fromEntries(MODULES.map((m) => [m.key, m.label]));
