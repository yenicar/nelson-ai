import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nelson AI — Account Intelligence",
  description: "An always-on AI Account Manager for B2B portfolios.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
