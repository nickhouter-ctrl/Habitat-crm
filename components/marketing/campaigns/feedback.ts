/**
 * Review-feedback van Meta leesbaar maken (brief §7: afkeuringen prominent).
 * `reviewFeedback` kan twee vormen hebben: Meta's `ad_review_feedback`
 * (genest object met reden → uitleg) of onze eigen `{ publishError }` van een
 * mislukte publicatie. Beide worden platgeslagen tot losse NL-toonbare zinnen.
 */

/** Statussen die om aandacht vragen — rood in de UI. */
export const PROBLEM_STATUSES = new Set(["DISAPPROVED", "WITH_ISSUES", "PUBLISH_FAILED"]);

/** Sla een reviewFeedback-object plat tot leesbare zinnen. */
export function describeReviewFeedback(feedback: unknown): string[] {
  const out: string[] = [];
  const walk = (value: unknown, path: string[]): void => {
    if (value == null) return;
    if (typeof value === "string" || typeof value === "number") {
      const label = path.length > 0 ? `${path.join(" · ")}: ` : "";
      out.push(`${label}${value}`);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, path);
      return;
    }
    if (typeof value === "object") {
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, key === "publishError" ? ["Publicatie mislukt"] : [...path, key]);
      }
    }
  };
  walk(feedback, []);
  return out;
}
