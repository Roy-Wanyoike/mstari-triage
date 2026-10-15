import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mstari — the Triage Desk",
  description:
    "Agentic triage queue for a busy public OPD: cited SATS/TEWS priority scoring, human clinician gate, full audit trail. Agentic AI for Africa Challenge — healthcare track.",
  keywords: ["Mstari", "triage", "SATS", "TEWS", "MCP", "LangGraph", "healthcare", "Africa"],
  openGraph: {
    title: "Mstari — the Triage Desk",
    description: "Scores and sequences the OPD queue. Never diagnoses, never prescribes, never decides.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
