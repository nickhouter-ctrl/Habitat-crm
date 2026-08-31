import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Property photos — Supabase Storage (CRM project)
      { protocol: "https", hostname: "kcsqmsmferruwnhsibxk.supabase.co" },
      // Habitat One catalogue / Supabase storage (legacy)
      { protocol: "https", hostname: "vokzfqjyujcuuldvajvo.supabase.co" },
      // Holded-hosted assets (logos, attachments)
      { protocol: "https", hostname: "app.holded.com" },
    ],
  },
  experimental: {
    // Photo uploads go through Server Actions; default body limit is 1 MB.
    serverActions: { bodySizeLimit: "25mb" },
  },
  // @react-pdf/renderer is Node-only — don't try to bundle it.
  serverExternalPackages: ["@react-pdf/renderer"],
  // PDF fonts are read from public/fonts at runtime — trace them into the bundle.
  outputFileTracingIncludes: {
    "/**/*": ["./public/fonts/**/*"],
  },
  // De handtekening-generator is één los HTML-bestand in public/. Zo houdt het
  // personeel een korte link en blijft het bestand gewoon te openen en te
  // bewerken zonder dat er een React-pagina omheen hoeft.
  async rewrites() {
    return [{ source: "/handtekening", destination: "/handtekening.html" }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
