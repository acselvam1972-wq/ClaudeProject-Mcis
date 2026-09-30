// Pure progress-measurement logic (no DB access) — unit tested in progress.test.ts.

/** Standard weighting for a structural steel package (sums to 100). */
export const DEFAULT_STAGES = [
  { code: "FAB", name: "Fabrication", weight: 20, qcHold: false },
  { code: "PAINT", name: "Blasting & Painting", weight: 10, qcHold: true },
  { code: "DISPATCH", name: "Dispatch from Shop", weight: 5, qcHold: false },
  { code: "RECEIPT", name: "Receipt at Site", weight: 5, qcHold: false },
  { code: "ERECT", name: "Erection", weight: 35, qcHold: false },
  { code: "BOLT", name: "Bolting & Torquing", weight: 10, qcHold: true },
  { code: "ALIGN", name: "Alignment & Plumbness", weight: 10, qcHold: true },
  { code: "FINAL", name: "Final Inspection & Touch-up", weight: 5, qcHold: true },
];


export interface StageDef {
  id: string;
  code: string;
  sequence: number;
  weight: number; // percent, all stages sum to 100
  qcHold: boolean;
}

/** Earned kg for a quantity at a stage: unit weight x qty x stage weight share. */
export function earnedKg(unitWeightKg: number, qty: number, stageWeightPct: number): number {
  return unitWeightKg * qty * (stageWeightPct / 100);
}

export function stageWeightTotal(stages: Pick<StageDef, "weight">[]): number {
  return Math.round(stages.reduce((s, x) => s + x.weight, 0) * 1000) / 1000;
}

export function validateStageWeights(stages: Pick<StageDef, "weight" | "code">[]): string | null {
  if (stages.length === 0) return "At least one stage is required.";
  if (stages.some((s) => !(s.weight >= 0))) return "Stage weights must be non-negative.";
  const total = stageWeightTotal(stages);
  if (Math.abs(total - 100) > 0.001) return `Stage weights must total 100% (currently ${total}%).`;
  const codes = new Set(stages.map((s) => s.code));
  if (codes.size !== stages.length) return "Stage codes must be unique.";
  return null;
}

/**
 * Validates a new progress booking against sequencing rules:
 *  - quantity must be a positive integer
 *  - booked (approved + pending) at this stage cannot exceed member quantity
 *  - booked at this stage cannot exceed APPROVED quantity at the previous stage
 *    (you cannot erect what has not been received, and QC-held work gates the next stage)
 */
export function validateBooking(args: {
  memberQty: number;
  bookedAtStage: number; // approved + pending at this stage
  prevStageApproved: number | null; // null when this is the first stage
  addQty: number;
  stageCode: string;
  prevStageCode?: string;
}): string | null {
  const { memberQty, bookedAtStage, prevStageApproved, addQty, stageCode, prevStageCode } = args;
  if (!Number.isInteger(addQty) || addQty === 0) return "Quantity must be a non-zero whole number.";
  const next = bookedAtStage + addQty;
  if (next < 0) return `Cannot reduce ${stageCode} below zero (currently ${bookedAtStage}).`;
  if (next > memberQty) return `${stageCode}: total ${next} would exceed member quantity ${memberQty}.`;
  if (addQty > 0 && prevStageApproved !== null && next > prevStageApproved) {
    return `${stageCode}: total ${next} exceeds approved ${prevStageCode ?? "previous stage"} quantity ${prevStageApproved}.`;
  }
  return null;
}

/** Member completion % (0-100) from approved stage quantities. */
export function memberPercent(
  memberQty: number,
  stages: Pick<StageDef, "id" | "weight">[],
  qtyByStage: Map<string, number>,
): number {
  if (memberQty <= 0) return 0;
  let pct = 0;
  for (const s of stages) pct += (Math.min(qtyByStage.get(s.id) ?? 0, memberQty) / memberQty) * s.weight;
  return pct;
}

/** The furthest stage fully completed for all pieces of a member. */
export function currentStageCode(
  memberQty: number,
  stages: Pick<StageDef, "id" | "code" | "sequence">[],
  qtyByStage: Map<string, number>,
): string {
  const ordered = [...stages].sort((a, b) => a.sequence - b.sequence);
  let last = "NOT STARTED";
  for (const s of ordered) {
    const q = qtyByStage.get(s.id) ?? 0;
    if (q >= memberQty && memberQty > 0) last = s.code;
    else if (q > 0) return `${s.code} (partial)`;
    else break;
  }
  return last;
}

export interface DailyEarned {
  date: string; // YYYY-MM-DD
  earnedKg: number;
}

export interface CurvePoint {
  date: string;
  actual?: number;
  planned?: number;
}

/** Cumulative actual % series from daily earned kg. */
export function cumulativeActual(daily: DailyEarned[], totalKg: number): { date: string; pct: number }[] {
  if (totalKg <= 0) return [];
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  let cum = 0;
  return sorted.map((d) => {
    cum += d.earnedKg;
    return { date: d.date, pct: Math.min(100, (cum / totalKg) * 100) };
  });
}

/** Linear interpolation of planned cumulative % at a date. */
export function plannedAt(plan: { date: string; pct: number }[], date: string): number {
  if (plan.length === 0) return 0;
  const sorted = [...plan].sort((a, b) => a.date.localeCompare(b.date));
  if (date <= sorted[0].date) return date === sorted[0].date ? sorted[0].pct : 0;
  const last = sorted[sorted.length - 1];
  if (date >= last.date) return last.pct;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (date <= b.date) {
      const t0 = Date.parse(a.date);
      const t1 = Date.parse(b.date);
      const t = Date.parse(date);
      return a.pct + ((b.pct - a.pct) * (t - t0)) / (t1 - t0);
    }
  }
  return last.pct;
}

/** Merge planned and actual series onto one date axis (actual stops at `today`). */
export function mergeCurves(
  plan: { date: string; pct: number }[],
  actual: { date: string; pct: number }[],
  today: string,
): CurvePoint[] {
  const dates = new Set<string>([...plan.map((p) => p.date), ...actual.map((a) => a.date)]);
  if (actual.length) dates.add(today);
  const sortedActual = [...actual].sort((a, b) => a.date.localeCompare(b.date));
  const out: CurvePoint[] = [];
  let ai = 0;
  let lastActual = 0;
  for (const date of [...dates].sort()) {
    while (ai < sortedActual.length && sortedActual[ai].date <= date) lastActual = sortedActual[ai++].pct;
    const point: CurvePoint = { date };
    if (plan.length) point.planned = round2(plannedAt(plan, date));
    if (actual.length && date <= today) point.actual = round2(lastActual);
    out.push(point);
  }
  return out;
}

/** Schedule Performance Index proxy: actual % / planned %. */
export function spi(actualPct: number, plannedPct: number): number | null {
  if (plannedPct <= 0) return null;
  return actualPct / plannedPct;
}

export const round2 = (v: number) => Math.round(v * 100) / 100;
