export const fmtTonnes = (kg: number, digits = 1) =>
  `${(kg / 1000).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} t`;

export const fmtPct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;

export const fmtNum = (v: number, digits = 0) =>
  v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

export function fmtDateTime(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** Parse YYYY-MM-DD into a UTC-midnight Date (matches @db.Date storage). */
export function parseDay(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`Invalid date: ${s}`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${s}`);
  return d;
}

export function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
