import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://agentcloud-control-plane.premhiru.chatgpt.site"),
  title: "AgentCloud — Persistent AI workers, governed from day one",
  description: "Create, deploy, and supervise durable AI workers with explicit authority, human approvals, and complete operational timelines.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "AgentCloud — Persistent AI workers",
    description: "Durable agent infrastructure with explicit authority and human control.",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "AgentCloud product overview" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
