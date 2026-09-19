import type { Metadata } from "next";
import "./globals.css";
import "@/components/klipfon/operations.css";
import { LiveSupport } from "@/components/klipfon/live-support";

export const metadata: Metadata = {
  title: "Klipfon — Klip üret. Paylaş. Kazan.",
  description: "Yayıncılar kampanyalarını fonlar. Klipperlar izinli içeriklerden klip üretir, uygun görüntülenmelere göre kazanır.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="dark">
      <body className="antialiased">{children}<LiveSupport /></body>
    </html>
  );
}
