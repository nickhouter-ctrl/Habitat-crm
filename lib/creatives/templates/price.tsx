/**
 * Sjabloon "price" — full-bleed beeld met de prijs (badge) prominent in een
 * schijf (brief §6). Zonder badge valt het terug op een rustige frame-variant.
 */
import type { ReactElement } from "react";

import type { TemplateProps } from "../schema";
import {
  BottomScrim,
  CoverImage,
  CtaPill,
  Eyebrow,
  Headline,
  Logo,
  Subline,
} from "./shared";

export function PriceTemplate({
  spec,
  palette,
  size,
  typeScale,
  headlineScale,
  logoUri,
}: TemplateProps): ReactElement {
  const pad = 64;
  const disc = spec.format === "1080x1920" ? 340 : 300;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "relative",
        width: size.width,
        height: size.height,
        fontFamily: "Sora",
        backgroundColor: palette.ground,
      }}
    >
      <CoverImage src={spec.assetUrl} width={size.width} height={size.height} />
      <BottomScrim color={palette.ground} />

      <Logo logoUri={logoUri} style={{ position: "absolute", top: pad, left: pad }} />

      {spec.copy.badge ? (
        <div
          style={{
            position: "absolute",
            top: pad,
            right: pad,
            width: disc,
            height: disc,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette.accent,
            color: palette.onAccent,
            borderRadius: 999,
            transform: "rotate(-8deg)",
            padding: 28,
          }}
        >
          <div
            style={{
              display: "block",
              lineClamp: 3,
              fontSize: Math.round(typeScale.badge * 1.35),
              fontWeight: 800,
              lineHeight: 1.15,
              textAlign: "center",
            }}
          >
            {spec.copy.badge}
          </div>
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          padding: pad,
          gap: 26,
        }}
      >
        {spec.copy.eyebrow ? (
          <Eyebrow text={spec.copy.eyebrow} typeScale={typeScale} color={palette.accent} />
        ) : null}
        <Headline
          text={spec.copy.headline}
          typeScale={typeScale}
          headlineScale={headlineScale}
          color={palette.ink}
          maxLines={spec.format === "1080x1920" ? 4 : 3}
        />
        {spec.copy.subline ? (
          <Subline text={spec.copy.subline} typeScale={typeScale} color={palette.ink} maxLines={2} />
        ) : null}
        {spec.copy.cta ? (
          <div style={{ display: "flex", marginTop: 10 }}>
            <CtaPill text={spec.copy.cta} typeScale={typeScale} palette={palette} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
