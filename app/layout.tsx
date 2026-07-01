import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IM-Telligence",
  description: "Teacher management and AI-assisted teaching platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
