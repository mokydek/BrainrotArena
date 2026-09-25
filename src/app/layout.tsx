import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "@fontsource/lilita-one/400.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/nunito/900.css";
import "@fontsource/rubik/800.css";
import "./globals.css";
import { detectLang } from "@/lib/i18n";
import HellBackground from "@/components/HellBackground";

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Brainrot Arena — giveaways & top streamers",
  description: "Join brainrot giveaways, watch top streamers live. Provably fair winner draw.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Brainrot Arena",
    description: "Brainrot giveaways & top streamers",
    images: [{ url: "/og.jpg", width: 1200, height: 1200 }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#8e0f06",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const h = await headers();
  const lang = detectLang(jar.get("ba_lang")?.value, h.get("accept-language"));
  return (
    <html lang={lang}>
      <body>
        <HellBackground />
        {children}
      </body>
    </html>
  );
}
