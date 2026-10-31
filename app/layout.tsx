import type { Metadata } from "next";
import "./globals.css";
import {PreferenceLoader} from "../components/preferences";

export const metadata: Metadata = {
  title: "mimy.｜今夜、あなたのそばに。",
  description: "安心して話せる、予約制の雑談・会話練習。",
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
    <html lang="ja">
      <body className="antialiased"><PreferenceLoader/>{children}</body>
    </html>
  );
}
