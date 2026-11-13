/**
 * Instellingen voor de social-media-weekplanning, allemaal uit env zodat de
 * eigenaar ze kan bijstellen zonder deploy van code. Puur (geen server-only),
 * zodat de planner en de tests dezelfde parsing gebruiken.
 */

export const SOCIAL_TIME_ZONE = "Europe/Madrid";

/** ISO-weekdagen (1 = maandag … 7 = zondag). Standaard ma/wo/vr. */
export function parseWeekdays(raw: string | undefined | null): number[] {
  const days = (raw ?? "")
    .split(/[,\s]+/)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  const unique = [...new Set(days)].sort((a, b) => a - b);
  return unique.length ? unique : [1, 3, 5];
}

/** "HH:MM" of de standaard 08:00. */
export function parsePublishTime(raw: string | undefined | null): string {
  const v = (raw ?? "").trim();
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : "08:00";
}

/**
 * Trefwoorden die een beeld uitsluiten (bestandsnaam of tag). De eigenaar wil
 * geen zwarte/donkere marmerlooks; aanvullen via SOCIAL_EXCLUDE_KEYWORDS.
 */
export const DEFAULT_EXCLUDE_KEYWORDS = [
  "black-marble",
  "dark-marble",
  "marmol-negro",
  "nero",
  "negro",
  "marquina",
  "black",
  "dark",
  "zwart",
];

export function parseKeywords(raw: string | undefined | null, fallback: string[]): string[] {
  if (raw == null || raw.trim() === "") return fallback;
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export interface SocialConfig {
  weekdays: number[];
  publishTime: string;
  excludeKeywords: string[];
  /** Een beeld wordt zo lang niet opnieuw gebruikt. */
  reuseAfterDays: number;
  /** Videolengte in seconden voor de AI-video (eigenaar: 10–15 s, uitleggend). */
  videoSeconds: number;
  ownerEmail: string;
}

export function socialConfig(env: Record<string, string | undefined> = process.env): SocialConfig {
  const reuse = Number.parseInt(env.SOCIAL_REUSE_AFTER_DAYS ?? "", 10);
  const seconds = Number.parseInt(env.SOCIAL_VIDEO_SECONDS ?? "", 10);
  return {
    weekdays: parseWeekdays(env.SOCIAL_POST_WEEKDAYS),
    publishTime: parsePublishTime(env.SOCIAL_PUBLISH_TIME),
    excludeKeywords: parseKeywords(env.SOCIAL_EXCLUDE_KEYWORDS, DEFAULT_EXCLUDE_KEYWORDS),
    reuseAfterDays: Number.isInteger(reuse) && reuse >= 0 ? reuse : 90,
    videoSeconds: Number.isInteger(seconds) && seconds >= 5 && seconds <= 15 ? seconds : 10,
    ownerEmail: env.SOCIAL_OWNER_EMAIL?.trim() || "nick@habitat-one.com",
  };
}
