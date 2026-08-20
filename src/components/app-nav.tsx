"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Cable, House, ListTree, Settings, ShieldCheck, Workflow, type LucideIcon } from "lucide-react";

type NavItem = Readonly<{
  label: string;
  href: string;
  icon: LucideIcon;
  aliases?: readonly string[];
}>;

const primaryLinks: readonly NavItem[] = [
  { label: "Home", href: "/dashboard", icon: House },
  { label: "Workers", href: "/workers", icon: Workflow },
  { label: "Runs", href: "/runs", icon: ListTree },
  { label: "Approvals", href: "/approvals", icon: ShieldCheck },
  { label: "Connections", href: "/connections", aliases: ["/integrations"], icon: Cable },
];

const workspaceLinks: readonly NavItem[] = [
  { label: "Audit trail", href: "/activity", icon: Activity },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function isNavLinkActive(pathname: string, item: Pick<NavItem, "href" | "aliases">): boolean {
  return [item.href, ...(item.aliases ?? [])].some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

function NavLink({ item, pathname, badge }: { item: NavItem; pathname: string; badge?: number }) {
  const active = isNavLinkActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex min-w-max items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${active ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-strong)]"}`}
    >
      <Icon size={17} />
      <span>{item.label}</span>
      {badge !== undefined && badge > 0 && <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-black text-amber-900" aria-label={`${badge} pending approvals`}>{badge}</span>}
    </Link>
  );
}

export function AppNav({ pendingApprovalCount }: { pendingApprovalCount?: number }) {
  const pathname = usePathname();
  return (
    <aside className="border-b border-[var(--line)] bg-white lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r">
      <div className="flex h-16 items-center px-5 text-lg font-black tracking-tight">AgentCloud</div>
      <nav className="nav-scroll flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1" aria-label="Main navigation">
        {primaryLinks.map((item) => <NavLink key={item.href} item={item} pathname={pathname} badge={item.href === "/approvals" ? pendingApprovalCount : undefined} />)}
        <div className="ml-2 hidden border-l border-[var(--line)] pl-3 lg:ml-0 lg:mt-7 lg:block lg:border-l-0 lg:border-t lg:px-3 lg:pt-5">
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">Workspace</p>
        </div>
        {workspaceLinks.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
      </nav>
    </aside>
  );
}
