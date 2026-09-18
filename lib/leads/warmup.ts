/**
 * Hoeveel campagnemail mag er vandaag uit, en mag er nu gestuurd worden?
 *
 * Twee dingen die dit moet regelen:
 *
 *  **Opwarmen.** Een domein dat nooit bulk stuurde en morgen 7.000 mails de
 *  deur uit doet, wordt door Gmail en Outlook als spam behandeld. Dus bouwen we
 *  op: 200, 200, 300, 400, 500, 650, 800, 1.000. Zo is een lijst van 7.000 in
 *  ongeveer twee weken rond en heeft het domein ondertussen reputatie opgebouwd.
 *  Dit staat in code en niet in iemands agenda, want handmatige discipline is
 *  precies wat hier misgaat.
 *
 *  **Verzendvenster.** Koude zakelijke mail hoort op een werkdag tussen negen en
 *  zes aan te komen, in Madrid-tijd. Een cron op Vercel loopt op UTC en schuift
 *  dus met de zomertijd mee; daarom wordt het venster hier nog een keer
 *  gecontroleerd met de echte Madrid-klok.
 *
 * Puur, dus volledig te testen.
 */
import { madridDagenTussen, madridDelen } from "@/lib/tz-madrid";

/**
 * Dagcap per verzenddag sinds de start — het STANDAARD opwarmschema. Wie sneller
 * wil, zet een eigen cap; die gaat hier dan voor.
 */
export const WARMUP_STAPPEN = [200, 400, 700, 1000, 1500, 2000, 2500, 3000] as const;

/**
 * Bovengrens in code. Niet omdat de software het niet kan — er past ruim
 * 10.000 per dag in het verzendvenster — maar omdat dit de grens is waar
 * ontvangende partijen naar kijken. Boven de 5.000 per dag vanaf een domein dat
 * nog nauwelijks bulk stuurde, is de kans groot dat Gmail en Outlook gaan
 * vertragen of in de spammap zetten. En dit is hetzelfde domein waar de
 * offertes en facturen vandaan komen.
 */
export const HARD_MAX = 5000;

/** Zonder startdatum: de eerste trede, dus voorzichtig. */
export const START_CAP = WARMUP_STAPPEN[0];

/**
 * Welke opwarmdag is het? Alleen werkdagen tellen mee, want in het weekend
 * gaat er niets uit en dan mag de trap ook niet doorlopen.
 */
export function opwarmDag(startedAt: Date, nu: Date, opts?: { alleenWerkdagen?: boolean }): number {
  const alleenWerkdagen = opts?.alleenWerkdagen ?? true;
  const dagen = madridDagenTussen(startedAt, nu);
  if (dagen <= 0) return 1;
  if (!alleenWerkdagen) return dagen + 1;

  let werkdagen = 0;
  for (let i = 0; i <= dagen; i++) {
    const dag = madridDelen(new Date(startedAt.getTime() + i * 86_400_000)).weekdag;
    if (dag !== 0 && dag !== 6) werkdagen++;
  }
  return Math.max(1, werkdagen);
}

/**
 * De dagcap. `override` is de handmatige instelling uit de database: die mag
 * omlaag, en omhoog tot HARD_MAX maar niet verder.
 */
export function dagCap(
  startedAt: Date | null,
  nu: Date,
  override?: number | null,
  opts?: { alleenWerkdagen?: boolean },
): number {
  const trap = startedAt
    ? WARMUP_STAPPEN[Math.min(opwarmDag(startedAt, nu, opts), WARMUP_STAPPEN.length) - 1]
    : START_CAP;
  if (override == null) return Math.min(trap, HARD_MAX);
  return Math.max(0, Math.min(override, HARD_MAX));
}

/**
 * Hoeveel mag er deze ronde nog? Nooit meer dan wat er vandaag over is, en
 * nooit meer dan één ronde aankan binnen de tijdslimiet van de functie.
 */
export function rondeBudget(args: { cap: number; vandaagVerstuurd: number; perRonde: number }): number {
  const over = args.cap - args.vandaagVerstuurd;
  return Math.max(0, Math.min(over, args.perRonde));
}

/**
 * Hoe groot moet een ronde zijn om de dagcap te halen?
 *
 * Er zijn ongeveer 54 rondes per dag (elke tien minuten, negen uur venster) en
 * een ronde mag niet langer duren dan pakweg 240 seconden — de functie stopt na
 * 300. Dus hoe hoger de cap, hoe meer mails per ronde en hoe korter de pauze
 * ertussen. Onder de 1.350 per dag blijft het rustig druppelen met zes
 * seconden; daarboven wordt het tempo opgevoerd.
 */
export const RONDES_PER_DAG = 54;
export const MAX_RONDE_SECONDEN = 200;

export function rondeVorm(cap: number): { perRonde: number; throttleSeconds: number } {
  const nodig = Math.ceil(Math.max(0, cap) / RONDES_PER_DAG);
  const perRonde = Math.max(10, Math.min(250, nodig));
  // Pauze zo groot als binnen de rondetijd past, maar nooit meer dan 6s.
  const throttleSeconds = Math.max(1, Math.min(6, Math.floor(MAX_RONDE_SECONDEN / perRonde)));
  return { perRonde, throttleSeconds };
}

export interface Venster {
  vanUur: number;
  totUur: number;
  alleenWerkdagen: boolean;
}

/** Zit dit moment in het verzendvenster, gerekend op de klok in Madrid? */
export function inVenster(nu: Date, v: Venster): boolean {
  const { uur, weekdag } = madridDelen(nu);
  if (v.alleenWerkdagen && (weekdag === 0 || weekdag === 6)) return false;
  return uur >= v.vanUur && uur < v.totUur;
}

/**
 * Pauze tussen twee mails, met wat ruis erop. Gelijkmatig druppelen is bij
 * koude mail het hele punt; precies elke 6,000 seconden versturen ziet er
 * juist machinaal uit.
 */
export function pauzeMs(throttleSeconds: number, willekeur = Math.random): number {
  const basis = Math.max(0, throttleSeconds) * 1000;
  const ruis = basis * 0.3;
  return Math.round(basis - ruis + willekeur() * ruis * 2);
}

/** Wachttijd na een mislukte poging: 5 minuten, 30 minuten, 2 uur. */
export function opnieuwNa(pogingen: number): number {
  const trap = [5, 30, 120];
  return (trap[Math.min(pogingen, trap.length) - 1] ?? 120) * 60_000;
}

/**
 * Noodrem. Boven de 5% harde bounces sluiten providers accounts, dus we grijpen
 * eerder in: boven 4% stopt het verzenden zichzelf. Onder de 200 verzendingen
 * zegt een percentage nog niets, dus dan niet.
 */
export const BOUNCE_GRENS = 0.04;
export const KLACHT_GRENS = 0.003;
export const MIN_VOOR_OORDEEL = 200;

export function moetStoppen(stats: { verstuurd: number; bounces: number; klachten: number }): string | null {
  if (stats.verstuurd < MIN_VOOR_OORDEEL) return null;
  const bounce = stats.bounces / stats.verstuurd;
  const klacht = stats.klachten / stats.verstuurd;
  if (bounce > BOUNCE_GRENS) return `bouncepercentage ${(bounce * 100).toFixed(1)}% — boven de grens van 4%`;
  if (klacht > KLACHT_GRENS) return `klachtpercentage ${(klacht * 100).toFixed(2)}% — boven de grens van 0,3%`;
  return null;
}
