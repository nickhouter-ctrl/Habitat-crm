/**
 * Gedeelde bouwstenen voor de vier sjablonen — één bron van waarheid voor
 * eyebrow, kop, subregel, CTA-knop, badge en logo.
 *
 * Satori-regels die hier overal gelden (brief §6, "hier gaat het mis als je
 * het vergeet"): alléén flexbox, elke container expliciet `display: "flex"`,
 * `position: "absolute"` alleen binnen een expliciet relative ouder, geen
 * canvas-filters of blend modes, gradients via `backgroundImage`.
 */
import type { CSSProperties, ReactElement } from "react";

import { LOGO_ASPECT, type Palette, type TypeScale } from "../tokens";

/** Kop met automatische verkleining (§6b). `lineClamp` is de vangrail zodat
 *  óók een te lange kop (die validatie tegenhoudt voor `approved`) nooit het
 *  layout breekt tijdens preview. */
export function Headline({
  text,
  typeScale,
  headlineScale,
  color,
  maxLines,
  align = "flex-start",
}: {
  text: string;
  typeScale: TypeScale;
  headlineScale: number;
  color: string;
  maxLines: number;
  align?: "flex-start" | "center";
}): ReactElement {
  return (
    <div
      style={{
        display: "block",
        lineClamp: maxLines,
        fontSize: Math.round(typeScale.headline * headlineScale),
        fontWeight: 800,
        lineHeight: 1.08,
        color,
        textAlign: align === "center" ? "center" : "left",
      }}
    >
      {text}
    </div>
  );
}

export function Eyebrow({
  text,
  typeScale,
  color,
  align = "flex-start",
}: {
  text: string;
  typeScale: TypeScale;
  color: string;
  align?: "flex-start" | "center";
}): ReactElement {
  return (
    <div
      style={{
        display: "block",
        lineClamp: 1,
        fontSize: typeScale.eyebrow,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color,
        textAlign: align === "center" ? "center" : "left",
      }}
    >
      {text}
    </div>
  );
}

export function Subline({
  text,
  typeScale,
  color,
  maxLines,
  align = "flex-start",
}: {
  text: string;
  typeScale: TypeScale;
  color: string;
  maxLines: number;
  align?: "flex-start" | "center";
}): ReactElement {
  return (
    <div
      style={{
        display: "block",
        lineClamp: maxLines,
        fontSize: typeScale.subline,
        fontWeight: 400,
        lineHeight: 1.35,
        color,
        textAlign: align === "center" ? "center" : "left",
      }}
    >
      {text}
    </div>
  );
}

/** CTA als knop-pil in het accentkleur. */
export function CtaPill({
  text,
  typeScale,
  palette,
}: {
  text: string;
  typeScale: TypeScale;
  palette: Palette;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        backgroundColor: palette.accent,
        color: palette.onAccent,
        fontSize: typeScale.cta,
        fontWeight: 600,
        padding: "20px 44px",
        borderRadius: 999,
      }}
    >
      {text}
    </div>
  );
}

/** Kleine badge-pil (bv. "v.a. 1.250 €"). Lege badge = niet tekenen. */
export function BadgePill({
  text,
  typeScale,
  palette,
  style,
}: {
  text: string;
  typeScale: TypeScale;
  palette: Palette;
  style?: CSSProperties;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        backgroundColor: palette.accent,
        color: palette.onAccent,
        fontSize: typeScale.badge,
        fontWeight: 600,
        padding: "14px 30px",
        borderRadius: 999,
        ...style,
      }}
    >
      {text}
    </div>
  );
}

/** Logo met expliciete maten (Satori tekent geen auto-maat afbeeldingen). */
export function Logo({
  logoUri,
  height = 52,
  style,
}: {
  logoUri: string;
  height?: number;
  style?: CSSProperties;
}): ReactElement {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUri}
      alt=""
      width={Math.round(height * LOGO_ASPECT)}
      height={height}
      style={style}
    />
  );
}

/** Full-bleed achtergrondfoto binnen een relative ouder. */
export function CoverImage({
  src,
  width,
  height,
}: {
  src: string;
  width: number;
  height: number;
}): ReactElement {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={width}
      height={height}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        objectFit: "cover",
      }}
    />
  );
}

/** Donkere verloop-scrim onderin, zodat tekst op elke foto leesbaar blijft. */
export function BottomScrim({ color, heightPct = 58 }: { color: string; heightPct?: number }): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        width: "100%",
        height: `${heightPct}%`,
        display: "flex",
        backgroundImage: `linear-gradient(to top, ${color}f5 22%, ${color}00)`,
      }}
    />
  );
}
