import { OrganizationList } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session.userId) redirect("/sign-in");
  if (session.orgId) redirect("/dashboard");

  return (
    <main className="container grid min-h-screen place-items-center py-10">
      <div className="grid w-full max-w-3xl justify-items-center gap-7 text-center">
        <Link href="/" className="text-xl font-black tracking-tight">AgentCloud</Link>
        <div className="space-y-2">
          <p className="pill mx-auto w-fit">Workspace setup</p>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Choose or create an organization</h1>
          <p className="mx-auto max-w-xl text-[var(--muted)]">
            Every worker, approval, integration, and audit event belongs to one isolated organization.
          </p>
        </div>
        <OrganizationList
          hidePersonal
          skipInvitationScreen
          afterCreateOrganizationUrl="/dashboard"
          afterSelectOrganizationUrl="/dashboard"
        />
      </div>
    </main>
  );
}
