"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export function RouteTabs({ tabs }: { tabs: { href: string; label: string; count?: number }[] }) {
  const path = usePathname();
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const active = path === t.href;
        return (
          <Link key={t.href} href={t.href} className={clsx("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", active ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink")}>
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 rounded bg-surface-2 px-1.5 text-xs tabular text-ink-2">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
