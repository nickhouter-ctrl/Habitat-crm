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
};

export default nextConfig;
