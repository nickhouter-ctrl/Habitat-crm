/**
 * Weekplanner voor social-posts — puur en deterministisch (seed = weekdatum),
 * zodat hij testbaar is en opnieuw draaien hetzelfde plan geeft.
 *
 * Regels:
 *  - één post per ingestelde weekdag (standaard ma/wo/vr);
 *  - precies één videoslot per week (een Reel, uitleggend; bron = één beeld);
 *  - de overige slots wisselen per week tussen carrousel, uitleg/montage en
 *    losse foto — en elke post krijgt een ander thema;
 *  - een beeld komt niet terug binnen `reuseAfterDays` (en nooit twee keer in
 *    dezelfde week); de uitsluitlijst (zwart/donker marmer) geldt altijd.
 */
import { deriveTheme, isExcluded, preferenceScore, type SocialTheme } from "./themes";

export type SocialPostKind = "carousel" | "single" | "howto" | "video";

export interface PlannerAsset {
  id: string;
  /** Bestandsnaam / sourceRef. */
  name: string | null;
  tags: string[] | null;
  source?: string | null;
  width?: number | null;
  height?: number | null;
  /** Laatste social-gebruik (YYYY-MM-DD) of null. */
  lastUsedOn?: string | null;
}

export interface PlannedPost {
  slot: number;
  plannedDate: string;
  kind: SocialPostKind;
  theme: SocialTheme | "mixed";
  /** Beelden in postvolgorde (bij video: leeg — zie videoSourceAssetId). */
  assetIds: string[];
  videoSourceAssetId: string | null;
}

export interface PlanWeekInput {
  /** Maandag van de te plannen week, YYYY-MM-DD. */
  weekStart: string;
  /** ISO-weekdagen 1..7. */
  weekdays: number[];
  assets: PlannerAsset[];
  reuseAfterDays: number;
  excludeKeywords: string[];
}

export const CAROUSEL_MIN = 3;
export const CAROUSEL_MAX = 5;

/* -------------------------------------------------------------- datums */

export function shiftDate(day: string, days: number): string {
  const at = new Date(`${day}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** ISO-weekdag (1 = ma … 7 = zo) van een YYYY-MM-DD. */
export function isoWeekday(day: string): number {
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** De kalenderdatum in Madrid voor een moment. */
export function madridDay(now: Date): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
}

/** Maandag van de week ná de week waarin `now` (Madrid) valt. */
export function nextWeekStart(now: Date): string {
  const today = madridDay(now);
  return shiftDate(today, 8 - isoWeekday(today));
}

/** Maandag van de week waarin `day` valt. */
export function weekStartOf(day: string): string {
  return shiftDate(day, 1 - isoWeekday(day));
}

/* ------------------------------------------------------------ seed/rng */

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Weeknummer sinds epoch — voor de wisseling van soorten per week. */
function weekIndex(weekStart: string): number {
  return Math.floor(Date.parse(`${weekStart}T12:00:00Z`) / (7 * 86_400_000));
}

/* ------------------------------------------------------------- soorten */

/**
 * Soort per slot. Het videoslot zit in het midden van de week (bij ma/wo/vr:
 * woensdag); de andere slots draaien wekelijks door carrousel → uitleg → foto.
 */
export function kindsForWeek(slotCount: number, weekStart: string): SocialPostKind[] {
  if (slotCount <= 0) return [];
  const videoAt = Math.min(1, slotCount - 1);
  const rotation: SocialPostKind[] = ["carousel", "howto", "single"];
  const offset = ((weekIndex(weekStart) % rotation.length) + rotation.length) % rotation.length;
  const kinds: SocialPostKind[] = [];
  let r = 0;
  for (let i = 0; i < slotCount; i++) {
    if (i === videoAt) kinds.push("video");
    else kinds.push(rotation[(offset + r++) % rotation.length]);
  }
  return kinds;
}

/* ------------------------------------------------------------- planner */

interface Scored extends PlannerAsset {
  theme: SocialTheme;
  score: number;
  jitter: number;
  recent: boolean;
}

function byPreference(a: Scored, b: Scored): number {
  // Niet-recent eerst, dan score, dan (bij gelijke score) seeded volgorde.
  if (a.recent !== b.recent) return a.recent ? 1 : -1;
  if (a.recent && b.recent && (a.lastUsedOn ?? "") !== (b.lastUsedOn ?? "")) {
    return (a.lastUsedOn ?? "") < (b.lastUsedOn ?? "") ? -1 : 1;
  }
  return b.score - a.score || a.jitter - b.jitter;
}

/** Stapnummer = laatste getal in de naam ("install-cut-3.jpg" → 3), of null. */
export function stepNumber(name: string | null | undefined): number | null {
  const m = (name ?? "").replace(/\.[a-z0-9]{2,4}$/i, "").match(/(\d+)(?!.*\d)/);
  return m ? Number(m[1]) : null;
}

/** Uitlegreeksen op stapvolgorde; zonder nummers op natuurlijke naamvolgorde. */
function byStep(a: Scored, b: Scored): number {
  const sa = stepNumber(a.name);
  const sb = stepNumber(b.name);
  if (sa != null && sb != null && sa !== sb) return sa - sb;
  return (a.name ?? "").localeCompare(b.name ?? "", "en", { numeric: true, sensitivity: "base" });
}

export function planWeek(input: PlanWeekInput): PlannedPost[] {
  const days = [...new Set(input.weekdays)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  const kinds = kindsForWeek(days.length, input.weekStart);
  const rng = mulberry32(hashString(input.weekStart));
  const reuseCutoff = shiftDate(input.weekStart, -input.reuseAfterDays);

  const pool: Scored[] = input.assets
    .filter((a) => !isExcluded(a.name, a.tags, input.excludeKeywords))
    .map((a) => ({
      ...a,
      theme: deriveTheme(a.name, a.tags),
      score: preferenceScore(a),
      jitter: rng(),
      recent: Boolean(a.lastUsedOn && a.lastUsedOn >= reuseCutoff),
    }))
    .sort(byPreference);

  const taken = new Set<string>();
  const usedThemes = new Set<string>();
  const free = () => pool.filter((a) => !taken.has(a.id));

  /** Beste thema met minstens `min` vrije, niet-recente beelden (optioneel beperkt). */
  const pickThemeGroup = (min: number, only?: SocialTheme[]): Scored[] | null => {
    const groups = new Map<SocialTheme, Scored[]>();
    for (const a of free()) {
      if (a.recent) continue;
      if (only && !only.includes(a.theme)) continue;
      groups.set(a.theme, [...(groups.get(a.theme) ?? []), a]);
    }
    const ranked = [...groups.entries()]
      .filter(([, list]) => list.length >= min)
      .sort(([ta, la], [tb, lb]) => {
        const fresh = Number(usedThemes.has(ta)) - Number(usedThemes.has(tb));
        if (fresh) return fresh;
        const avg = (l: Scored[]) => l.slice(0, CAROUSEL_MAX).reduce((s, x) => s + x.score, 0) / Math.min(l.length, CAROUSEL_MAX);
        return avg(lb) - avg(la) || lb.length - la.length;
      });
    return ranked[0]?.[1] ?? null;
  };

  const take = (list: Scored[]) => {
    for (const a of list) taken.add(a.id);
  };

  // Eerst de soorten die een hele reeks nodig hebben (uitleg, carrousel), dan
  // de losse foto, als laatste de videobron — zo pakt één beeld geen reeks af.
  const PRIORITY: Record<SocialPostKind, number> = { howto: 0, carousel: 1, single: 2, video: 3 };
  const order = kinds.map((kind, slot) => ({ kind, slot })).sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.slot - b.slot);

  const posts: PlannedPost[] = [];
  order.forEach(({ kind, slot }) => {
    const plannedDate = shiftDate(input.weekStart, days[slot] - 1);
    let chosen: Scored[] = [];
    let theme: SocialTheme | "mixed" = "general";
    let finalKind = kind;

    if (kind === "carousel" || kind === "howto") {
      const group =
        kind === "howto"
          ? pickThemeGroup(CAROUSEL_MIN, ["installation"])
          : pickThemeGroup(CAROUSEL_MIN);
      if (group) {
        const picked = group.slice(0, CAROUSEL_MAX);
        chosen = kind === "howto" ? [...picked].sort(byStep) : picked;
        theme = group[0].theme;
      } else {
        // Te weinig beelden van één thema (of geen montagereeks): gemengde
        // carrousel van de beste vrije beelden, recent gebruikte als laatste.
        if (kind === "howto") finalKind = "carousel";
        chosen = free().slice(0, CAROUSEL_MAX);
        theme = chosen.length && chosen.every((a) => a.theme === chosen[0].theme) ? chosen[0].theme : "mixed";
        if (chosen.length < CAROUSEL_MIN) finalKind = "single";
      }
    } else {
      // Losse foto of videobron: het beste vrije beeld van een nog niet gebruikt thema.
      const candidates = free();
      const preferred =
        kind === "video"
          ? candidates.filter((a) => ["texture", "installation", "interior", "curved", "column", "shower"].includes(a.theme))
          : candidates;
      const best =
        preferred.find((a) => !a.recent && !usedThemes.has(a.theme)) ??
        candidates.find((a) => !a.recent && !usedThemes.has(a.theme)) ??
        candidates[0];
      if (best) {
        chosen = [best];
        theme = best.theme;
      }
    }

    if (finalKind === "single") chosen = chosen.slice(0, 1);
    if (finalKind === "single" && chosen[0]) theme = chosen[0].theme;
    take(chosen);
    usedThemes.add(theme);
    posts.push({
      slot,
      plannedDate,
      kind: finalKind,
      theme,
      assetIds: finalKind === "video" ? [] : chosen.map((a) => a.id),
      videoSourceAssetId: finalKind === "video" ? (chosen[0]?.id ?? null) : null,
    });
  });
  return posts.sort((a, b) => a.slot - b.slot);
}
