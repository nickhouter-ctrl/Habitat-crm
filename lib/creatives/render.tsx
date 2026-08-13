/**
 * Dé rendermotor — er is er maar één (brief §2: geen tweede rendermotor).
 * Preview in de editor, export voor publicatie en de render-API gebruiken
 * allemaal deze functie, dus wat je ziet is wat er live gaat.
 *
 * Server-side via `ImageResponse` uit next/og (Satori), niet met canvas in de
 * browser (§3.1): batchbaar, geen CORS-gedoe met externe beelden.
 */
import { ImageResponse } from "next/og";

import { loadCreativeFonts, loadLogoDataUri } from "./fonts";
import { renderableSpecSchema, type RenderableSpec } from "./schema";
import { TEMPLATES } from "./templates";
import { FORMATS, PALETTES, TYPE_SCALE } from "./tokens";
import { headlineScaleFor, HEADLINE_SHRINK_STEPS } from "./validate";

/**
 * Render een spec naar PNG. Valideert de invoer (zod) en kiest de
 * kopverkleining (§6b). Een kop die zelfs op 78% niet past rendert tóch —
 * met lineClamp als vangrail — zodat de editor live kan voorspiegelen wat er
 * mis is; validate.ts voorkomt dat zo'n spec `approved` wordt.
 *
 * @throws ZodError bij een ongeldige spec — de aanroeper vertaalt dat naar
 *   een nette foutmelding.
 */
export async function renderCreative(input: unknown): Promise<ImageResponse> {
  const spec: RenderableSpec = renderableSpecSchema.parse(input);

  const size = FORMATS[spec.format];
  const entry = TEMPLATES[spec.template];
  const palette = PALETTES[spec.palette];
  const minScale = HEADLINE_SHRINK_STEPS[HEADLINE_SHRINK_STEPS.length - 1];
  const headlineScale =
    headlineScaleFor(spec.copy.headline.length, entry.limits[spec.format].headline) ?? minScale;

  const [fonts, logoUri] = await Promise.all([
    loadCreativeFonts(),
    loadLogoDataUri(palette.logo),
  ]);

  const Template = entry.component;
  return new ImageResponse(
    (
      <Template
        spec={spec}
        palette={palette}
        size={size}
        typeScale={TYPE_SCALE[spec.format]}
        headlineScale={headlineScale}
        logoUri={logoUri}
      />
    ),
    { width: size.width, height: size.height, fonts },
  );
}
