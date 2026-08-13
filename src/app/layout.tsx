import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

import "./globals.css";

export const metadata: Metadata = {
  title: "AgentCloud",
  description: "A safe control plane for persistent AI workers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const content = <div className="shell">{children}</div>;
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <html lang="en">
      <body>{publishableKey ? <ClerkProvider publishableKey={publishableKey}>{content}</ClerkProvider> : content}</body>
    </html>
  );
}
