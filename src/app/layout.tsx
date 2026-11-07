import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Kabisera Ledger", template: "%s · Kabisera Ledger" },
  description:
    "Recordkeeping for a small GCash cash-in, cash-out and mobile-load business. Not an official GCash product.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-PH" className={geistSans.variable}>
      {/* Browser extensions such as Grammarly add data attributes before React hydrates. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
