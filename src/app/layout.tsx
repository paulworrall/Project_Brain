import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// WPP Sans, as in Reporting Hub (WPP Enterprise Solutions | MAP design system).
const wpp = localFont({
  src: [
    { path: "../../public/fonts/WPP-Thin.woff2", weight: "100", style: "normal" },
    { path: "../../public/fonts/WPP-Light.woff2", weight: "300", style: "normal" },
    { path: "../../public/fonts/WPP-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/WPP-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/WPP-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-wpp",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Project Brain",
  description: "Turning a client brief into a structured, staged project workflow.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${wpp.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
