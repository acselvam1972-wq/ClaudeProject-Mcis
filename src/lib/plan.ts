// Baseline S-curve generation.

const DAY = 86_400_000;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Generates a cumulative S-curve between start and end using a normalised logistic
 * function. `steepness` ~ 8-12 gives a typical construction profile.
 * Returns points every `intervalDays`, always including start (0%) and end (100%).
 */
export function generateSCurve(
  start: Date,
  end: Date,
  intervalDays = 7,
  steepness = 10,
): { date: string; pct: number }[] {
  const t0 = start.getTime();
  const t1 = end.getTime();
  if (!(t1 > t0)) throw new Error("End date must be after start date.");
  if (intervalDays < 1) throw new Error("Interval must be at least 1 day.");
  const f = (x: number) => 1 / (1 + Math.exp(-steepness * (x - 0.5)));
  const f0 = f(0);
  const f1 = f(1);
  const points: { date: string; pct: number }[] = [];
  for (let t = t0; t < t1; t += intervalDays * DAY) {
    const x = (t - t0) / (t1 - t0);
    points.push({ date: iso(new Date(t)), pct: Math.round(((f(x) - f0) / (f1 - f0)) * 10000) / 100 });
  }
  points.push({ date: iso(end), pct: 100 });
  return points;
}

/** Parses "date,percent" CSV lines (header optional). Percentages must be non-decreasing, 0..100. */
export function parsePlanCsv(text: string): { date: string; pct: number }[] {
  const out: { date: string; pct: number }[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const [i, line] of lines.entries()) {
    const [d, p] = line.split(/[,;\t]/).map((s) => s.trim());
    if (i === 0 && !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue; // header
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Line ${i + 1}: invalid date "${d}" (use YYYY-MM-DD).`);
    const pct = Number(p);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error(`Line ${i + 1}: percent must be 0-100.`);
    out.push({ date: d, pct });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < out.length; i++) {
    if (out[i].date === out[i - 1].date) throw new Error(`Duplicate date ${out[i].date}.`);
    if (out[i].pct < out[i - 1].pct) throw new Error(`Planned % must not decrease (at ${out[i].date}).`);
  }
  return out;
}
