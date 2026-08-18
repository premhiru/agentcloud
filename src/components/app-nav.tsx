import Link from "next/link";
import { Activity, Cable, LayoutDashboard, Settings, ShieldCheck, Workflow } from "lucide-react";

const links = [
  ["Overview", "/dashboard", LayoutDashboard],
  ["Workers", "/workers", Workflow],
  ["Approvals", "/approvals", ShieldCheck],
  ["Integrations", "/integrations", Cable],
  ["Activity", "/activity", Activity],
  ["Settings", "/settings", Settings],
] as const;

export function AppNav() {
  return (
    <aside className="border-b border-[var(--line)] bg-white lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r">
      <div className="flex h-16 items-center px-5 text-lg font-black tracking-tight">AgentCloud</div>
      <nav className="nav-scroll flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1" aria-label="Main navigation">
        {links.map(([label, href, Icon]) => (
          <Link key={href} href={href} className="flex min-w-max items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-strong)]">
            <Icon size={17} /> {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
