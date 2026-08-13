/**
 * Sjabloon "swatch" — beeld als staalkaart (materiaalmonster) op een gekleurde
 * ondergrond (brief §6). Het beeld krijgt een lichte kaart-rand zoals een
 * fysiek staal; tekst gecentreerd eronder.
 */
import type { ReactElement } from "react";

import type { TemplateProps } from "../schema";
import { BadgePill, CtaPill, Eyebrow, Headline, Logo, Subline } from "./shared";

export function SwatchTemplate({
  spec,
  palette,
  size,
  typeScale,
  headlineScale,
  sublineScale,
  logoUri,
}: TemplateProps): ReactElement {
  const pad = 72;
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
        padding: pad,
        alignItems: "center",
      }}
    >
      {spec.copy.eyebrow ? (
        <Eyebrow
          text={spec.copy.eyebrow}
          typeScale={typeScale}
          color={palette.accent}
          align="center"
        />
      ) : null}

      {/* De staalkaart: fotokader met paspartoe-rand, vult de resterende ruimte. */}
      <div
        style={{
          display: "flex",
          position: "relative",
          flexGrow: 1,
          alignSelf: "stretch",
          marginTop: 28,
          marginBottom: 40,
          padding: 22,
          backgroundColor: palette.ink,
          borderRadius: 10,
          boxShadow: `0 24px 60px ${palette.onAccent}55`,
        }}
      >
        <div
          style={{
            display: "flex",
            position: "relative",
            flexGrow: 1,
            overflow: "hidden",
            borderRadius: 4,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={spec.assetUrl}
            alt=""
            width={size.width - 2 * pad - 44}
            height={100}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </div>
        {spec.copy.badge ? (
          <BadgePill
            text={spec.copy.badge}
            typeScale={typeScale}
            palette={palette}
            style={{ position: "absolute", top: -18, right: -14 }}
          />
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
        }}
      >
        <Headline
          text={spec.copy.headline}
          typeScale={{ ...typeScale, headline: Math.round(typeScale.headline * 0.82) }}
          headlineScale={headlineScale}
          color={palette.ink}
          maxLines={spec.format === "1080x1920" ? 3 : 2}
          align="center"
        />
        {spec.copy.subline ? (
          <Subline
            text={spec.copy.subline}
            typeScale={typeScale}
            color={palette.muted}
            maxLines={spec.format === "1080x1920" ? 3 : 2}
            align="center"
            scale={sublineScale}
          />
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 36, marginTop: 6 }}>
          {spec.copy.cta ? (
            <CtaPill text={spec.copy.cta} typeScale={typeScale} palette={palette} />
          ) : null}
          <Logo logoUri={logoUri} height={44} />
        </div>
      </div>
    </div>
  );
}
