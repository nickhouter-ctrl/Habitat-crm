/**
 * Sjabloon "split" — beeld boven, gekleurd tekstblok onder (brief §6).
 * Badge over de foto linksboven; CTA en logo naast elkaar onderin.
 */
import type { ReactElement } from "react";

import type { TemplateProps } from "../schema";
import { BadgePill, CtaPill, Eyebrow, Headline, Logo, Subline } from "./shared";

export function SplitTemplate({
  spec,
  palette,
  size,
  typeScale,
  headlineScale,
  logoUri,
}: TemplateProps): ReactElement {
  const pad = 64;
  const imageHeight = Math.round(size.height * 0.5);
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={spec.assetUrl}
        alt=""
        width={size.width}
        height={imageHeight}
        style={{ width: size.width, height: imageHeight, objectFit: "cover" }}
      />
      {spec.copy.badge ? (
        <BadgePill
          text={spec.copy.badge}
          typeScale={typeScale}
          palette={palette}
          style={{ position: "absolute", top: pad, left: pad }}
        />
      ) : null}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "space-between",
          padding: pad,
          backgroundColor: palette.ground,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {spec.copy.eyebrow ? (
            <Eyebrow text={spec.copy.eyebrow} typeScale={typeScale} color={palette.accent} />
          ) : null}
          <Headline
            text={spec.copy.headline}
            typeScale={typeScale}
            headlineScale={headlineScale}
            color={palette.ink}
            maxLines={spec.format === "1080x1920" ? 5 : 3}
          />
          {spec.copy.subline ? (
            <Subline
              text={spec.copy.subline}
              typeScale={typeScale}
              color={palette.muted}
              maxLines={spec.format === "1080x1080" ? 2 : 3}
            />
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 24,
          }}
        >
          {spec.copy.cta ? (
            <CtaPill text={spec.copy.cta} typeScale={typeScale} palette={palette} />
          ) : (
            <div style={{ display: "flex" }} />
          )}
          <Logo logoUri={logoUri} />
        </div>
      </div>
    </div>
  );
}
