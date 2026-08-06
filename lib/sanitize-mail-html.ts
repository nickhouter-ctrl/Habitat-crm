import "server-only";

import sanitizeHtml from "sanitize-html";

/**
 * Maakt HTML uit inkomende mail veilig om in de CRM-origin te renderen.
 * Inkomende mail is attacker-controlled: iedereen kan naar hi@/purchase@
 * mailen, dus scripts, event-handlers en formulieren moeten eruit.
 * Opmaak (tabellen, afbeeldingen, links) blijft staan zodat nieuwsbrieven
 * en leveranciersmails leesbaar blijven.
 */
export function sanitizeMailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "h1",
      "h2",
      "center",
      "font",
      "u",
    ],
    allowedAttributes: {
      "*": ["style", "align", "valign", "width", "height", "bgcolor", "color", "border", "cellpadding", "cellspacing"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height"],
    },
    // http(s)-afbeeldingen en cid: (inline attachments, renderen als broken img)
    allowedSchemes: ["http", "https", "mailto", "tel", "cid"],
    // Links uit mail nooit in de CRM-tab zelf openen en geen opener-referentie.
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
    // Geen <style>-blokken: die kunnen de CRM-UI zelf herstylen.
    disallowedTagsMode: "discard",
  });
}
