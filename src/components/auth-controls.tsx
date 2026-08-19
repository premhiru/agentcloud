"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export function AuthControls() {
  return (
    <div className="flex items-center gap-2">
      <Show when="signed-out">
        <SignInButton>
          <button type="button" className="button button-secondary">Sign in</button>
        </SignInButton>
        <SignUpButton>
          <button type="button" className="button">Create account</button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <Link href="/dashboard" className="button button-secondary">Open dashboard</Link>
        <UserButton />
      </Show>
    </div>
  );
}
