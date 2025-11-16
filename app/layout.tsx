import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jeopairdy!",
  description: "Play a fun game of clues and answerslive with friends",
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

