import type { Metadata } from "next";
import localFont from "next/font/local";
import { Lexend_Deca } from "next/font/google";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});
// HubSpot's own current brand typeface — headings/nav only (see
// .app-shell h1/h2/h3 and nav button rules in globals.css); body text
// stays on Geist for small-size readability, matching HubSpot's own
// actual pairing (Lexend Deca for display, a plain sans for body copy).
const lexendDeca = Lexend_Deca({
  subsets: ["latin"],
  variable: "--font-lexend-deca",
});

export const metadata: Metadata = {
  title: "AI Chat Platform",
  description: "Multi-tenant AI customer-support chat platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${lexendDeca.variable}`} style={{ fontFamily: "var(--font-geist-sans)" }}>
        {children}
      </body>
    </html>
  );
}
