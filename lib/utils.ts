import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, resolving conflicts (last wins). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as EUR currency (Habitat One operates in euros). */
export function formatEUR(amount: number | string | null | undefined) {
  const n = typeof amount === "string" ? Number(amount) : amount ?? 0;
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(Number.isFinite(n) ? (n as number) : 0);
}

/** Format a date (Date | ISO string | unix seconds) as a short readable string. */
export function formatDate(value: Date | string | number | null | undefined) {
  if (value == null) return "—";
  const d =
    typeof value === "number"
      ? new Date(value * (value < 1e12 ? 1000 : 1))
      : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  }).format(d);
}

/** Build initials from a name, e.g. "Nick Houter" -> "NH". */
export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
