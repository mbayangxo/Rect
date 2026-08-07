import type { Metadata } from "next";
import { DM_Sans, Syne } from "next/font/google";
import { PlayerProvider } from "@/components/player-provider";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "RECT SOUND",
  description: "RECT SOUND — a world of music.",
  icons: {
    icon: [{ url: "/rect-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/rect-icon.svg" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${dmSans.variable} antialiased`}
    >
      <body className="bg-[#040d06] font-[family-name:var(--font-dm-sans)] text-[#f8f8f8]">
        <PlayerProvider>{children}</PlayerProvider>
      </body>
    </html>
  );
}
