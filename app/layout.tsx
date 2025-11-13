import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jeopairdy - Live Jeopardy Game",
  description: "Play Jeopardy! live with friends",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

