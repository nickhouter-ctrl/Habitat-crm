/**
 * Is een accountaanvraag echt? Conservatief: bij elke twijfel → handmatig.
 * Zuivere regels (testbaar) + twee netwerkchecks (MX-record, EU-btw-register).
 */
import { resolveMx } from "node:dns/promises";

export type AccountCandidate = {
  name: string;
  email: string;
  phone: string | null;
  kind: "particulier" | "zakelijk";
  source: string;
  businessName: string | null;
  vatNumber: string | null;
  message: string | null;
};

export type CheckResult = { ok: boolean; reasons: string[]; vies?: ViesResult | null };
export type ViesResult = { valid: boolean; name: string | null; country: string; number: string };

/** Bekende wegwerp-mailadressen. */
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com",
  "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc", "fakeinbox.com",
  "throwawaymail.com", "mintemail.com", "mohmal.com", "emailondeck.com", "tempmailo.com", "moakt.com",
  "burnermail.io", "spamgourmet.com", "mailnesia.com", "mytemp.email", "tempail.com", "inboxkitten.com",
]);

const FAKE_NAME = /^(test|testing|asdf|qwerty|xxx+|aaa+|abc|admin|user|naam|name|nombre|demo|foo|bar|john doe|jane doe)$/i;

/** Regels die zonder netwerk te beoordelen zijn. Lege lijst = niets verdachts. */
export function ruleProblems(c: AccountCandidate): string[] {
  const problems: string[] = [];
  const name = c.name.trim();
  const letters = name.replace(/[^\p{L}]/gu, "");
  if (letters.length < 2) problems.push("Naam bevat te weinig letters");
  if (FAKE_NAME.test(name) || /(.)\1{3,}/.test(name.toLowerCase())) problems.push("Naam lijkt nep");
  if (/\d{3,}|https?:|www\./i.test(name)) problems.push("Naam bevat cijfers of een link");

  const email = c.email.trim().toLowerCase();
  const domain = email.split("@")[1] ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) problems.push("Ongeldig e-mailadres");
  if (DISPOSABLE.has(domain)) problems.push("Wegwerp-e-mailadres");
  if (/^(test|asdf|qwerty|noreply|no-reply)\b/.test(email)) problems.push("E-mailadres lijkt nep");

  if (c.phone?.trim()) {
    const digits = c.phone.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15 || /^(\d)\1+$/.test(digits)) problems.push("Telefoonnummer klopt niet");
  }
  if (c.message && /https?:\/\/|www\./i.test(c.message)) problems.push("Bericht bevat een link (spamkenmerk)");

  if (c.kind === "zakelijk") {
    if (!c.businessName?.trim()) problems.push("Bedrijfsnaam ontbreekt");
    if (!c.vatNumber?.trim()) problems.push("Btw-nummer ontbreekt");
  }
  if (c.source === "windows" && c.kind !== "zakelijk") problems.push("Windows-toegang alleen zakelijk");
  return problems;
}

const EU = new Set(["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK", "XI"]);

/** "ES B-12.345.678" → { country: "ES", number: "B12345678" }; zonder landcode → Spanje. */
export function splitVat(raw: string): { country: string; number: string } | null {
  const v = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (v.length < 6) return null;
  const cc = v.slice(0, 2) === "GR" ? "EL" : v.slice(0, 2);
  if (EU.has(cc) && v.length > 4) return { country: cc, number: v.slice(2) };
  return { country: "ES", number: v };
}

const LEGAL_FORMS = /\b(s\.?\s?l\.?u?|s\.?\s?a\.?|b\.?\s?v\.?|n\.?\s?v\.?|gmbh|ltd|limited|sociedad limitada|sl|slu|sa|bv|vof|eenmanszaak|cb|scp)\b/gi;
const words = (s: string) => s.toLowerCase().replace(LEGAL_FORMS, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter((w) => w.length > 1);

/** Komt de opgegeven bedrijfsnaam overeen met het register? (minstens één betekenisvol woord gelijk) */
export function namesMatch(given: string, registered: string): boolean {
  const a = new Set(words(given));
  return words(registered).some((w) => a.has(w));
}

async function hasMx(domain: string): Promise<boolean | null> {
  try {
    const mx = await Promise.race([resolveMx(domain), new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 5000))]);
    return mx.length > 0;
  } catch (err) {
    const code = (err as { code?: string }).code;
    // Domein bestaat niet / geen mailserver = nep. Andere fouten = onbekend (handmatig).
    return code === "ENOTFOUND" || code === "ENODATA" ? false : null;
  }
}

export async function checkVies(vat: string): Promise<ViesResult | null> {
  const parts = splitVat(vat);
  if (!parts) return null;
  try {
    const res = await fetch(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${parts.country}/vat/${parts.number}`, {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { isValid?: boolean; name?: string; userError?: string };
    if (j.userError && j.userError !== "VALID" && j.userError !== "INVALID") return null; // register tijdelijk niet bereikbaar
    const name = j.name && !/^-+$/.test(j.name.trim()) ? j.name.trim() : null; // Spanje geeft "---"
    return { valid: !!j.isValid, name, ...parts };
  } catch {
    return null;
  }
}

/** Volledige beoordeling. ok=true betekent: mag automatisch worden goedgekeurd. */
export async function checkAccountRequest(c: AccountCandidate): Promise<CheckResult> {
  const reasons = ruleProblems(c);
  const mx = await hasMx(c.email.split("@")[1] ?? "");
  if (mx === false) reasons.push("E-maildomein heeft geen mailserver");
  if (mx === null) reasons.push("Mailserver niet te controleren");

  let vies: ViesResult | null | undefined;
  if (c.kind === "zakelijk" && c.vatNumber?.trim()) {
    vies = await checkVies(c.vatNumber);
    if (vies === null) reasons.push("Btw-nummer niet te controleren in het EU-register (VIES)");
    else if (!vies.valid) reasons.push("Btw-nummer bestaat niet in het EU-register (VIES)");
    else if (vies.name && c.businessName && !namesMatch(c.businessName, vies.name)) reasons.push(`Bedrijfsnaam wijkt af van het register (${vies.name})`);
  }
  return { ok: reasons.length === 0, reasons, vies };
}
