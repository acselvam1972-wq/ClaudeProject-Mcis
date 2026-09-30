import "server-only";
import { prisma } from "./db";
import { areaProgress, contractorProgress, sCurve, stageTonnage } from "./queries";
import { fmtDate, todayUtc } from "./format";

/** Everything a periodic progress report needs, in one call. */
export async function progressReportData(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const weekAgo = todayUtc();
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  const [curve, stages, areas, contractors, ncrs, punch, weekEntries] = await Promise.all([
    sCurve(projectId),
    stageTonnage(projectId),
    areaProgress(projectId),
    contractorProgress(projectId),
    prisma.ncr.findMany({ where: { projectId }, orderBy: { number: "asc" }, include: { area: { select: { code: true } }, member: { select: { markNo: true } } } }),
    prisma.punchItem.findMany({ where: { projectId }, orderBy: { number: "asc" }, include: { area: { select: { code: true } }, contractor: { select: { name: true } } } }),
    prisma.$queryRaw<{ earned: number | null; erected: number | null }[]>`
      SELECT SUM(e.quantity * m."unitWeightKg" * s.weight / 100)::float AS earned,
             SUM(CASE WHEN s.code = 'ERECT' THEN e.quantity * m."unitWeightKg" ELSE 0 END)::float AS erected
      FROM "ProgressEntry" e JOIN "Member" m ON m.id = e."memberId" JOIN "Stage" s ON s.id = e."stageId"
      WHERE m."projectId" = ${projectId} AND e.status = 'APPROVED' AND e."workDate" > ${weekAgo}`,
  ]);
  return {
    project,
    reportDate: fmtDate(todayUtc()),
    curve,
    stages,
    areas,
    contractors,
    ncrs,
    punch,
    week: { earnedKg: weekEntries[0]?.earned ?? 0, erectedKg: weekEntries[0]?.erected ?? 0 },
  };
}
