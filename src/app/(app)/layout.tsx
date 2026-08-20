import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { AppNav } from "@/components/app-nav";
import { isDemoMode } from "@/lib/env";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const demo = isDemoMode() || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!demo) {
    const session = await auth();
    if (!session.userId) redirect("/sign-in");
    if (!session.orgId) redirect("/onboarding");
  }

  return (
    <div className="lg:flex">
      <AppNav />
      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between border-b border-[var(--line)] bg-white/90 px-5 backdrop-blur md:px-8">
          <div>{demo ? <span className="pill">Demo workspace</span> : <OrganizationSwitcher hidePersonal />}</div>
          {demo ? <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--foreground)] text-xs font-bold text-white" aria-label="Demo owner">DO</div> : <UserButton />}
        </header>
        <main className="p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}
