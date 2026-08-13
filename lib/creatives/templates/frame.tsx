/**
 * Sjabloon "frame" — full-bleed beeld, scrim onder, kop + knop (brief §6).
 * Badge linksboven, logo rechtsboven.
 */
import type { ReactElement } from "react";

import type { TemplateProps } from "../schema";
import {
  BadgePill,
  BottomScrim,
  CoverImage,
  CtaPill,
  Eyebrow,
  Headline,
  Logo,
  Subline,
} from "./shared";

export function FrameTemplate({
  spec,
  palette,
  size,
  typeScale,
  headlineScale,
  logoUri,
}: TemplateProps): ReactElement {
  const pad = 64;
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

      {spec.copy.badge ? (
        <BadgePill
          text={spec.copy.badge}
          typeScale={typeScale}
          palette={palette}
          style={{ position: "absolute", top: pad, left: pad }}
        />
      ) : null}
      <Logo logoUri={logoUri} style={{ position: "absolute", top: pad, right: pad }} />

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
          <Subline
            text={spec.copy.subline}
            typeScale={typeScale}
            color={palette.ink}
            maxLines={2}
          />
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
