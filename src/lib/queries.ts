import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { cumulativeActual, mergeCurves, plannedAt } from "./progress";
import { fmtDate, todayUtc } from "./format";

export interface ProjectTotals {
  totalKg: number;
  earnedKg: number;
  pieces: number;
  marks: number;
}

/** Filter fragment for optional area / contractor scoping on "Member" m. */
function scope(areaId?: string | null, contractorId?: string | null) {
  const parts: Prisma.Sql[] = [];
  if (areaId) parts.push(Prisma.sql`AND m."areaId" = ${areaId}`);
  if (contractorId) parts.push(Prisma.sql`AND m."contractorId" = ${contractorId}`);
  return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
}

export async function projectTotals(projectId: string, areaId?: string | null, contractorId?: string | null): Promise<ProjectTotals> {
  const [t] = await prisma.$queryRaw<{ total: number | null; pieces: bigint | null; marks: bigint }[]>`
    SELECT SUM(m."quantity" * m."unitWeightKg")::float AS total, SUM(m."quantity")::bigint AS pieces, COUNT(*)::bigint AS marks
    FROM "Member" m WHERE m."projectId" = ${projectId} ${scope(areaId, contractorId)}`;
  const [e] = await prisma.$queryRaw<{ earned: number | null }[]>`
    SELECT SUM(ms."qtyDone" * m."unitWeightKg" * s."weight" / 100)::float AS earned
    FROM "MemberStage" ms JOIN "Member" m ON m.id = ms."memberId" JOIN "Stage" s ON s.id = ms."stageId"
    WHERE m."projectId" = ${projectId} ${scope(areaId, contractorId)}`;
  return { totalKg: t.total ?? 0, earnedKg: e.earned ?? 0, pieces: Number(t.pieces ?? 0), marks: Number(t.marks) };
}

export interface StageTonnage {
  stageId: string;
  code: string;
  name: string;
  weight: number;
  qcHold: boolean;
  doneKg: number;
  pendingKg: number;
  totalKg: number;
}

/** Tonnage completed per stage (approved), plus tonnage pending QC. */
export async function stageTonnage(projectId: string, areaId?: string | null, contractorId?: string | null): Promise<StageTonnage[]> {
  const totals = await projectTotals(projectId, areaId, contractorId);
  const rows = await prisma.$queryRaw<{ id: string; code: string; name: string; weight: number; qcHold: boolean; done: number | null; pending: number | null }[]>`
    SELECT s.id, s.code, s.name, s.weight, s."qcHold",
      (SELECT SUM(ms."qtyDone" * m."unitWeightKg") FROM "MemberStage" ms JOIN "Member" m ON m.id = ms."memberId"
         WHERE ms."stageId" = s.id ${scope(areaId, contractorId)})::float AS done,
      (SELECT SUM(e."quantity" * m."unitWeightKg") FROM "ProgressEntry" e JOIN "Member" m ON m.id = e."memberId"
         WHERE e."stageId" = s.id AND e."status" = 'PENDING_QC' ${scope(areaId, contractorId)})::float AS pending
    FROM "Stage" s WHERE s."projectId" = ${projectId} ORDER BY s."sequence"`;
  return rows.map((r) => ({
    stageId: r.id,
    code: r.code,
    name: r.name,
    weight: r.weight,
    qcHold: r.qcHold,
    doneKg: r.done ?? 0,
    pendingKg: r.pending ?? 0,
    totalKg: totals.totalKg,
  }));
}

export interface GroupProgress {
  id: string;
  code: string;
  name: string;
  totalKg: number;
  earnedKg: number;
  erectedKg: number;
  pct: number;
  plannedPct: number | null;
}

export async function areaProgress(projectId: string, contractorId?: string | null): Promise<GroupProgress[]> {
  const erectStage = await prisma.stage.findFirst({ where: { projectId, code: "ERECT" }, select: { id: true } });
  const rows = await prisma.$queryRaw<{ id: string; code: string; name: string; total: number | null; earned: number | null; erected: number | null }[]>`
    SELECT a.id, a.code, a.name,
      (SELECT SUM(m."quantity" * m."unitWeightKg") FROM "Member" m WHERE m."areaId" = a.id ${scope(null, contractorId)})::float AS total,
      (SELECT SUM(ms."qtyDone" * m."unitWeightKg" * s."weight" / 100) FROM "MemberStage" ms
         JOIN "Member" m ON m.id = ms."memberId" JOIN "Stage" s ON s.id = ms."stageId"
         WHERE m."areaId" = a.id ${scope(null, contractorId)})::float AS earned,
      (SELECT SUM(ms."qtyDone" * m."unitWeightKg") FROM "MemberStage" ms JOIN "Member" m ON m.id = ms."memberId"
         WHERE m."areaId" = a.id AND ms."stageId" = ${erectStage?.id ?? ""} ${scope(null, contractorId)})::float AS erected
    FROM "Area" a WHERE a."projectId" = ${projectId} ORDER BY a.code`;

  const plans = await prisma.planPoint.findMany({ where: { projectId, areaId: { not: null } }, orderBy: { date: "asc" } });
  const today = fmtDate(todayUtc());
  return rows.map((r) => {
    const areaPlan = plans.filter((p) => p.areaId === r.id).map((p) => ({ date: fmtDate(p.date), pct: p.plannedPercent }));
    const total = r.total ?? 0;
    const earned = r.earned ?? 0;
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      totalKg: total,
      earnedKg: earned,
      erectedKg: r.erected ?? 0,
      pct: total > 0 ? (earned / total) * 100 : 0,
      plannedPct: areaPlan.length ? plannedAt(areaPlan, today) : null,
    };
  });
}

export async function contractorProgress(projectId: string): Promise<GroupProgress[]> {
  const rows = await prisma.$queryRaw<{ id: string; name: string; total: number | null; earned: number | null }[]>`
    SELECT c.id, c.name,
      (SELECT SUM(m."quantity" * m."unitWeightKg") FROM "Member" m WHERE m."contractorId" = c.id)::float AS total,
      (SELECT SUM(ms."qtyDone" * m."unitWeightKg" * s."weight" / 100) FROM "MemberStage" ms
         JOIN "Member" m ON m.id = ms."memberId" JOIN "Stage" s ON s.id = ms."stageId"
         WHERE m."contractorId" = c.id)::float AS earned
    FROM "Contractor" c WHERE c."projectId" = ${projectId} ORDER BY c.name`;
  return rows.map((r) => ({
    id: r.id,
    code: r.name,
    name: r.name,
    totalKg: r.total ?? 0,
    earnedKg: r.earned ?? 0,
    erectedKg: 0,
    pct: (r.total ?? 0) > 0 ? ((r.earned ?? 0) / (r.total ?? 1)) * 100 : 0,
    plannedPct: null,
  }));
}

/** Planned vs actual cumulative S-curve for the project or one area. */
export async function sCurve(projectId: string, areaId?: string | null, contractorId?: string | null) {
  const totals = await projectTotals(projectId, areaId, contractorId);
  const daily = await prisma.$queryRaw<{ d: Date; earned: number }[]>`
    SELECT e."workDate" AS d, SUM(e."quantity" * m."unitWeightKg" * s."weight" / 100)::float AS earned
    FROM "ProgressEntry" e JOIN "Member" m ON m.id = e."memberId" JOIN "Stage" s ON s.id = e."stageId"
    WHERE m."projectId" = ${projectId} AND e."status" = 'APPROVED' ${scope(areaId, contractorId)}
    GROUP BY e."workDate" ORDER BY e."workDate"`;
  const plan = (
    await prisma.planPoint.findMany({ where: { projectId, areaId: areaId ?? null }, orderBy: { date: "asc" } })
  ).map((p) => ({ date: fmtDate(p.date), pct: p.plannedPercent }));
  const actual = cumulativeActual(daily.map((r) => ({ date: fmtDate(r.d), earnedKg: r.earned })), totals.totalKg);
  const today = fmtDate(todayUtc());
  // Contractor-scoped curves have no baseline of their own.
  const usePlan = contractorId ? [] : plan;
  return {
    points: mergeCurves(usePlan, actual, today),
    plannedToday: usePlan.length ? plannedAt(usePlan, today) : null,
    actualToday: totals.totalKg > 0 ? (totals.earnedKg / totals.totalKg) * 100 : 0,
    totals,
  };
}

/** Earned tonnage per day over the last N days (productivity). */
export async function dailyEarned(projectId: string, days = 30) {
  const since = todayUtc();
  since.setUTCDate(since.getUTCDate() - days + 1);
  const rows = await prisma.$queryRaw<{ d: Date; earned: number; erected: number }[]>`
    SELECT e."workDate" AS d,
      SUM(e."quantity" * m."unitWeightKg" * s."weight" / 100)::float AS earned,
      SUM(CASE WHEN s.code = 'ERECT' THEN e."quantity" * m."unitWeightKg" ELSE 0 END)::float AS erected
    FROM "ProgressEntry" e JOIN "Member" m ON m.id = e."memberId" JOIN "Stage" s ON s.id = e."stageId"
    WHERE m."projectId" = ${projectId} AND e."status" = 'APPROVED' AND e."workDate" >= ${since}
    GROUP BY e."workDate" ORDER BY e."workDate"`;
  const byDate = new Map(rows.map((r) => [fmtDate(r.d), r]));
  const out: { date: string; earnedT: number; erectedT: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    const key = fmtDate(d);
    const r = byDate.get(key);
    out.push({ date: key, earnedT: r ? r.earned / 1000 : 0, erectedT: r ? r.erected / 1000 : 0 });
  }
  return out;
}
