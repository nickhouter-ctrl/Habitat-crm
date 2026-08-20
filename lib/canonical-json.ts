/**
 * Deterministische JSON + sha256 — de basis onder de handtekening-vingerafdruk.
 *
 * `JSON.stringify` schrijft sleutels in invoegvolgorde. Zodra iemand een veld in
 * een type verplaatst verandert de tekst, en dus de hash, terwijl er inhoudelijk
 * niets wijzigde. Een vingerafdruk die verandert door een refactor is geen
 * vingerafdruk. Daarom: sleutels recursief sorteren, geen witruimte.
 *
 * Arrays houden hun volgorde — die is bij offerteregels betekenisvol.
 */
import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const paren = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${paren.join(",")}}`;
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * De hash in leesbare brokjes, voor op de PDF en het scherm. Een klant die zijn
 * eigen exemplaar naast het onze kan leggen heeft meer aan "A3F2-91C4-7E0B" dan
 * aan 64 tekens hex.
 */
export function shortHash(hash: string): string {
  const h = hash.replace(/[^0-9a-f]/gi, "").toUpperCase();
  return [h.slice(0, 4), h.slice(4, 8), h.slice(8, 12)].join("-");
}
