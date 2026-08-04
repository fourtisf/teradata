import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans, Sora } from "next/font/google";
import "./globals.css";

/**
 * §5 — Sora for display, Plus Jakarta Sans for body, JetBrains Mono for every
 * number, address, hash, timestamp and eyebrow. Exposed as CSS custom
 * properties so components never name a font either.
 */
const display = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display",
  display: "swap",
});

const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

const TITLE = "Tare — Capital arriving on Solana";
const DESCRIPTION =
  "Bridges and exchange withdrawals, matched to the wallet that received them and followed " +
  "after landing. Round trips are removed, so the number you see is money that is actually here.";

/**
 * §8 lives or dies on this. Without a metadataBase, Open Graph and canonical
 * URLs resolve relative and crawlers see nothing usable — which is exactly the
 * failure mode that stays invisible until months of traffic have been lost.
 * Vercel sets VERCEL_URL on previews; production is the real domain.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
  : new URL("https://taredata.com");

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Tare",
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Tare",
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  // The only literal colour outside globals.css. A <meta> tag cannot reference
  // a custom property; keep it in step with --bg by hand.
  themeColor: "#0C0718",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
