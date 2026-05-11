import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Habitat One catalogue / Supabase storage
      { protocol: "https", hostname: "vokzfqjyujcuuldvajvo.supabase.co" },
      // Holded-hosted assets (logos, attachments)
      { protocol: "https", hostname: "app.holded.com" },
    ],
  },
};

export default nextConfig;
