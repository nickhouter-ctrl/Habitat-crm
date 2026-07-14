import { ImageResponse } from "next/og";

import { portalLinkForToken } from "@/lib/worker-portal";

/**
 * Preview-kaart (og:image) voor de urenportaal-link — zo toont WhatsApp een
 * nette Habitat One-kaart met de projectnaam in plaats van een kale URL.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Habitat One — Urenportaal";

export default async function OgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await portalLinkForToken(token).catch(() => null);
  const projectName = ctx?.project.name ?? null;

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
          backgroundColor: "#0c0a09",
          color: "#fafaf9",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: 14, display: "flex" }}>
          HABITAT ONE
        </div>
        <div
          style={{
            marginTop: 36,
            width: 120,
            height: 3,
            backgroundColor: "#a8a29e",
            display: "flex",
          }}
        />
        <div
          style={{
            marginTop: 36,
            fontSize: 40,
            letterSpacing: 8,
            color: "#d6d3d1",
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          Urenportaal · Horas
        </div>
        {projectName && (
          <div
            style={{
              marginTop: 28,
              fontSize: 54,
              fontWeight: 600,
              color: "#fafaf9",
              maxWidth: 1000,
              textAlign: "center",
              display: "flex",
            }}
          >
            {projectName}
          </div>
        )}
      </div>
    ),
    size,
  );
}
