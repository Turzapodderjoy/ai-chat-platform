import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIVA",
  description: "AI-powered customer support platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif', WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale" }}>
        {children}
      </body>
    </html>
  );
}
