import type { CalcPost } from "./calculator";

/** Confirmed by Nick on 2026-09-11: subcontractor price includes labor and materials.
 * Keep this local calculator default explicit; do not add the old labor allowance.
 */
export function confirmedCalculatorRate(post: CalcPost): CalcPost {
  if (post.name !== "Stucwerk buiten / gevel") return post;
  return {...post, hours:0, material:27.5, cost:27.5, waste:0, review:false,
    description:"Buitenstucwerk / monocapa. Bevestigde inkoopprijs € 27,50 per m² inclusief arbeid en materialen (11-09-2026). Klantprijs met 15% opslag: € 31,63 excl. btw. Geen extra montage-uren of materiaalverlies."};
}
