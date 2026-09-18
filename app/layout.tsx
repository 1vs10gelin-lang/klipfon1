import type { Metadata } from "next";
import "./globals.css";

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
      <body className="antialiased">{children}</body>
    </html>
  );
}
