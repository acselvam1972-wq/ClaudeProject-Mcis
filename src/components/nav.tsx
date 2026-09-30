"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {items.map((i) => {
        const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={clsx(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
              active ? "bg-sidebar-active font-medium text-white" : "text-sidebar-ink hover:bg-sidebar-active/60 hover:text-white",
            )}
          >
            <span aria-hidden className="w-4 text-center opacity-80">{i.icon}</span>
            <span className="flex-1">{i.label}</span>
            {!!i.badge && <span className="rounded-full bg-warn px-1.5 text-[10px] font-semibold text-black tabular">{i.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function ProjectSwitcher({ projects, current, action }: { projects: { id: string; code: string; name: string }[]; current?: string; action: (fd: FormData) => void }) {
  return (
    <form action={action}>
      <select
        name="projectId"
        defaultValue={current}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="max-w-[18rem] truncate rounded-md border border-line-strong bg-surface px-2 py-1 text-sm"
        aria-label="Active project"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} — {p.name}
          </option>
        ))}
      </select>
    </form>
  );
}
