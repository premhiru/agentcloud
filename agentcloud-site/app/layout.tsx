import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://agentcloud-control-plane.premhiru.chatgpt.site"),
  title: "AgentCloud — Build governed AI workers in conversation",
  description: "Describe, simulate, govern, and deploy persistent AI workers with immutable versions, explicit authority, human approvals, and an authenticated MCP.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "AgentCloud — Describe. Govern. Deploy.",
    description: "Conversationally built AI workers with immutable versions, explicit authority, and human control.",
    images: [{ url: "/og-builder.png", width: 1536, height: 1024, alt: "AgentCloud conversational builder, governed WorkerSpec, and approval checkpoint" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
