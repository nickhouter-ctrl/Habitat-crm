# lib/creatives — rendermotor voor advertentiebeelden

Server-side rendering van CreativeSpecs naar PNG via `ImageResponse` (next/og,
Satori). Eén motor voor preview én export (brief §2/§3.1): de editor toont
exact wat er naar Meta gaat.

## Kernprincipe

**De spec is de waarheid, de PNG is een afgeleide** (§3.2). Een `CreativeSpec`
(zod-schema in `schema.ts`) beschrijft sjabloon, palet, formaat, taal en
tekst; daaruit kan elk formaat of elke taal opnieuw worden uitgedraaid.

## Bestanden

| Bestand | Rol |
|---|---|
| `tokens.ts` | Puur data: 4 paletten (`{ground, ink, muted, accent, onAccent}`), 3 formaten, typeschaal, logovarianten. Client-safe. |
| `fonts.ts` | Sora-`.ttf`'s uit `public/fonts` als ArrayBuffer (géén CDN) + logo als data-URI. Server-only. |
| `schema.ts` | zod-schema's (`creativeSpecSchema`, `renderableSpecSchema`), `TemplateProps`, `specHash` (cache-sleutel voor de `renders`-tabel). |
| `validate.ts` | Layoutgaranties §6b: tekenlimieten, kopverkleining 100→88→78%, `validateSpecCopy` als poortwachter voor `approved`. |
| `templates/` | `frame`, `split`, `swatch`, `price` + registry (`index.ts`) met tekenlimieten als data per sjabloon × formaat. |
| `render.tsx` | `renderCreative(spec)` → `ImageResponse`. Het enige render-pad. |

## Endpoint

`GET /api/creatives/render?spec=<base64url-JSON>` (inline, immutable gecachet)
of `?id=<spec-uuid>` (uit de database, kort gecachet). Auth verplicht.

## Satori-valkuilen (§6)

Alleen flexbox (geen grid), `position: absolute` alleen in een expliciet
relative ouder, elke container expliciet `display: "flex"`, gradients via
`backgroundImage`, fonts als bestand. Gedeelde bouwstenen in
`templates/shared.tsx` houden zich hieraan — nieuwe sjablonen horen daarop te
bouwen.

## Tests

`lib/creatives/__tests__/creatives.test.tsx` rendert álle sjablonen × formaten
met de randgevallen uit §6b (kop 70 tekens, één woord van 25, lege
badge/subregel, subregel 200 tekens, vier talen met ñ/à/í/¿) en alle vier de
paletten. Draait in CI via `npm test`.
