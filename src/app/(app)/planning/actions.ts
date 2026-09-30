"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { audit } from "@/lib/audit";
import { runAction, type ActionState } from "@/lib/actions";
import { generateSCurve, parsePlanCsv } from "@/lib/plan";
import { parseDay } from "@/lib/format";

async function replaceBaseline(projectId: string, areaId: string | null, points: { date: string; pct: number }[], userId: string, source: string) {
  if (areaId && !(await prisma.area.findFirst({ where: { id: areaId, projectId } }))) throw new Error("Area not found.");
  await prisma.$transaction(async (tx) => {
    await tx.planPoint.deleteMany({ where: { projectId, areaId } });
    await tx.planPoint.createMany({ data: points.map((p) => ({ projectId, areaId, date: parseDay(p.date), plannedPercent: p.pct })) });
    await audit(tx, { userId, projectId, action: "BASELINE_REPLACED", entity: "PlanPoint", entityId: areaId, details: { source, points: points.length, first: points[0]?.date, last: points.at(-1)?.date } });
  });
  revalidatePath("/planning");
  revalidatePath("/");
}

const gen = z.object({
  areaId: z.string().optional().transform((s) => s || null),
  start: z.string().min(1),
  end: z.string().min(1),
  interval: z.coerce.number().int().min(1).max(31),
  steepness: z.coerce.number().min(2).max(20),
});

export async function generateBaseline(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("plan.edit");
    const project = await requireProject();
    const d = gen.parse(Object.fromEntries(fd));
    const points = generateSCurve(parseDay(d.start), parseDay(d.end), d.interval, d.steepness);
    await replaceBaseline(project.id, d.areaId, points, user.id, `generated (k=${d.steepness})`);
    return `Baseline generated with ${points.length} points.`;
  });
}

export async function uploadBaseline(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("plan.edit");
    const project = await requireProject();
    const areaId = String(fd.get("areaId") ?? "") || null;
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a CSV file.");
    const points = parsePlanCsv(await file.text());
    if (points.length < 2) throw new Error("At least two points are required.");
    await replaceBaseline(project.id, areaId, points, user.id, `csv:${file.name}`);
    return `Baseline uploaded with ${points.length} points.`;
  });
}
