import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

/**
 * Deelkaart (og:image) voor /handleiding — huisstijl-kaart in cream/brown met
 * terracotta accent, zodat de link er in WhatsApp/mail als een echte
 * Habitat One-pagina uitziet (zelfde opzet als de urenportaal-kaart).
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Habitat One — CRM Handboek";

export default async function OgImage() {
  const sora = await readFile(join(process.cwd(), "public/fonts/sora/Sora-SemiBold.ttf"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#faf7f1",
          color: "#2a2520",
          fontFamily: "Sora",
        }}
      >
        <div style={{ fontSize: 40, letterSpacing: 16, color: "#a98a4b", display: "flex" }}>
          HABITAT ONE
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 96,
            fontWeight: 600,
            letterSpacing: -2,
            display: "flex",
          }}
        >
          CRM Handboek
        </div>
        <div
          style={{ marginTop: 40, width: 140, height: 4, backgroundColor: "#b6552d", display: "flex" }}
        />
        <div style={{ marginTop: 40, fontSize: 34, color: "#7a6f63", display: "flex" }}>
          Zo werken we — van aanvraag tot oplevering
        </div>
        <div style={{ marginTop: 56, fontSize: 26, letterSpacing: 6, color: "#a98a4b", display: "flex" }}>
          XÀBIA · COSTA BLANCA
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Sora", data: sora, style: "normal", weight: 600 }],
    },
  );
}
