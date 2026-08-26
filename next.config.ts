import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB, easily exceeded by a real signed/scanned MSA,
      // Rate Card, or SOW Template file (letterheads, signature pages,
      // embedded images).
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
