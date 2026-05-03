import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClientProviders } from "./ClientProviders";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrustGate — ERC-8004 Agent Hiring Manager",
  description:
    "Read-only dashboard over the live ERC-8004 Identity + Reputation registries on Base Sepolia, with the AXL P2P bridge wired in.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-screen bg-bh-canvas text-bh-ink flex flex-col">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
