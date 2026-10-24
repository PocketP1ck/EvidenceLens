import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EvidenceLens",
  description: "An independent research agent that investigates drug-discovery hypotheses and looks for reasons they might be wrong.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
