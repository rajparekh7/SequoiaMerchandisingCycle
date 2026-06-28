import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Merchandising Cycle Analyzer",
  description:
    "Diagnose why growth stalled — score a company website against the Sequoia Merchandising Cycle.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
