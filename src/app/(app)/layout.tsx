import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { getControlPlane } from "@/application/control-plane";
import { AppNav } from "@/components/app-nav";
import { requirePageTenantContext } from "@/lib/auth/page-tenant-context";
import { isDemoMode } from "@/lib/env";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const demo = isDemoMode() || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!demo) {
    const session = await auth();
    if (!session.userId) redirect("/sign-in");
    if (!session.orgId) redirect("/onboarding");
  }

  let pendingApprovalCount: number | undefined;
  try {
    const context = await requirePageTenantContext();
    const approvals = await (await getControlPlane()).listApprovals(context);
    pendingApprovalCount = approvals.filter((approval) => approval.status === "PENDING").length;
  } catch {
    // The optional badge must not make otherwise available workspace pages fail.
  }

  return (
    <div className="lg:flex">
      <AppNav pendingApprovalCount={pendingApprovalCount} />
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
