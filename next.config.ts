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
  // officeparser (and its dynamic-require/WASM-heavy dependencies —
  // tesseract.js, pdfjs-dist) isn't on Next's built-in auto-externalized
  // package list. Left to Turbopack's Server Components bundling, its
  // named `OfficeParser` export comes back `undefined` at runtime in the
  // deployed serverless function (confirmed via production logs), even
  // though the same import works fine under `next dev` and in a plain
  // Node script. Externalizing it makes Next `require()` it natively
  // from node_modules instead of bundling it.
  serverExternalPackages: ["officeparser"],
};

export default nextConfig;
