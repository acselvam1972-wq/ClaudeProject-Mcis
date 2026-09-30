import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SteelTrack", template: "%s · SteelTrack" },
  description: "Steel structure construction progress tracking for process plants",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
