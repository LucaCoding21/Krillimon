import type { Metadata, Viewport } from "next";
import { M_PLUS_Rounded_1c, Nunito } from "next/font/google";
import "./globals.css";

const body = Nunito({ variable: "--font-body", subsets: ["latin"], weight: ["600", "700", "800", "900"] });
const display = M_PLUS_Rounded_1c({ variable: "--font-display", subsets: ["latin"], weight: ["700", "800", "900"] });

export const metadata: Metadata = {
  title: "Tall Grass · daily Pokémon rarity trivia",
  description: "Six prompts, 25 seconds each. Name the Pokémon nobody else thinks of.",
};

export const viewport: Viewport = { themeColor: "#141a33" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full`}>
      <body className="min-h-full font-body antialiased">{children}</body>
    </html>
  );
}
