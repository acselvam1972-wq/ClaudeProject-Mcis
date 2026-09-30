import Link from "next/link";
import clsx from "clsx";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClass }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={clsx("rounded-lg border border-line bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={clsx(bodyClass ?? "p-4")}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "bad" | "neutral" }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="text-xs font-medium text-ink-2">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && (
        <div className={clsx("mt-0.5 text-xs", tone === "good" ? "text-good-ink" : tone === "bad" ? "text-critical-ink" : "text-muted")}>{sub}</div>
      )}
    </div>
  );
}

const BADGE_TONES = {
  neutral: "bg-surface-2 text-ink-2 border-line-strong",
  info: "bg-accent-soft text-accent border-accent/30",
  good: "bg-good/10 text-good-ink border-good/40",
  warn: "bg-warn/15 text-ink border-warn/60",
  serious: "bg-serious/15 text-ink border-serious/60",
  critical: "bg-critical/10 text-critical-ink border-critical/40",
} as const;
const BADGE_ICONS: Record<keyof typeof BADGE_TONES, string> = { neutral: "", info: "", good: "✓ ", warn: "● ", serious: "▲ ", critical: "✕ " };

export type Tone = keyof typeof BADGE_TONES;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium", BADGE_TONES[tone])}>
      {BADGE_ICONS[tone]}
      {children}
    </span>
  );
}

export const statusTone = (s: string): Tone =>
  ({
    APPROVED: "good", PASSED: "good", CLOSED: "good", RECEIVED: "good",
    PENDING_QC: "warn", PENDING: "warn", UNDER_REVIEW: "warn", IN_TRANSIT: "info",
    OPEN: "serious", REJECTED: "critical", FAILED: "critical",
    CRITICAL: "critical", MAJOR: "serious", MINOR: "warn",
    A: "critical", B: "serious", C: "neutral",
  })[s] as Tone ?? "neutral";

export function StatusBadge({ value }: { value: string }) {
  return <Badge tone={statusTone(value)}>{value.replace(/_/g, " ")}</Badge>;
}

export function ProgressBar({ value, planned }: { value: number; planned?: number | null }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative h-2 w-full min-w-20 rounded-full bg-surface-2" role="meter" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-2 rounded-full bg-[var(--series-1)]" style={{ width: `${v}%` }} />
      {planned != null && (
        <div className="absolute -top-0.5 h-3 w-0.5 bg-ink" style={{ left: `calc(${Math.min(100, planned)}% - 1px)` }} title={`Planned ${planned.toFixed(1)}%`} />
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-muted">{children}</div>;
}

export function Pagination({ page, pageSize, total, params }: { page: number; pageSize: number; total: number; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  };
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-ink-2">
      <span className="tabular">
        {total === 0 ? "0 records" : `${(page - 1) * pageSize + 1}–${Math.min(total, page * pageSize)} of ${total.toLocaleString()}`}
      </span>
      <div className="flex gap-1">
        {page > 1 ? <Link className="btn btn-secondary btn-sm" href={href(page - 1)}>← Prev</Link> : <span className="btn btn-secondary btn-sm opacity-40">← Prev</span>}
        <span className="px-2 py-1 tabular">Page {page} / {pages}</span>
        {page < pages ? <Link className="btn btn-secondary btn-sm" href={href(page + 1)}>Next →</Link> : <span className="btn btn-secondary btn-sm opacity-40">Next →</span>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, active }: { tabs: { href: string; label: string; count?: number }[]; active: string }) {
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={clsx(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm",
            active === t.href ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded bg-surface-2 px-1.5 text-xs tabular text-ink-2">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="6" fill="#1c5cab" />
      <path d="M7 8h18v4h-7v12h-4V12H7z" fill="#fff" />
    </svg>
  );
}
