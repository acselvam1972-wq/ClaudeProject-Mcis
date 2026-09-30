"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { audit } from "@/lib/audit";
import { runAction, type ActionState } from "@/lib/actions";
import { reviewEntry } from "@/lib/services/progress-service";
import { parseDay } from "@/lib/format";

const opt = z.string().trim().optional().transform((s) => s || null);
const optNum = z.string().optional().transform((s, ctx) => {
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) ctx.addIssue({ code: "custom", message: "must be a number" });
  return n;
});

async function memberByMark(projectId: string, mark: string | null) {
  if (!mark) return null;
  const m = await prisma.member.findUnique({ where: { projectId_markNo: { projectId, markNo: mark.trim().toUpperCase() } }, select: { id: true, areaId: true } });
  if (!m) throw new Error(`Mark no. ${mark} not found.`);
  return m;
}

/** Next sequential document number, e.g. NCR-013. */
async function nextNumber(tx: Prisma.TransactionClient, table: "Ncr" | "PunchItem", projectId: string, prefix: string) {
  const rows = await tx.$queryRawUnsafe<{ n: number | null }[]>(
    `SELECT MAX(CAST(SUBSTRING(number FROM '[0-9]+$') AS INTEGER)) AS n FROM "${table}" WHERE "projectId" = $1`,
    projectId,
  );
  return `${prefix}-${String((rows[0]?.n ?? 0) + 1).padStart(3, "0")}`;
}

// ---- Approval queue ----------------------------------------------------------
export async function reviewEntries(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("qc.approve");
    const project = await requireProject();
    const ids = fd.getAll("ids").map(String).filter(Boolean);
    const decision = String(fd.get("decision"));
    const note = String(fd.get("note") ?? "").slice(0, 500) || null;
    if (ids.length === 0) throw new Error("Select at least one entry.");
    if (decision !== "approve" && decision !== "reject") throw new Error("Invalid decision.");
    if (decision === "reject" && !note) throw new Error("A reason is required when rejecting.");
    await prisma.$transaction(
      async (tx) => {
        for (const id of ids) await reviewEntry(tx, { projectId: project.id, entryId: id, approve: decision === "approve", userId: user.id, note });
      },
      { timeout: 60_000 },
    );
    revalidatePath("/qc");
    return `${ids.length} entr${ids.length === 1 ? "y" : "ies"} ${decision === "approve" ? "approved" : "rejected"}.`;
  });
}

// ---- Inspections -------------------------------------------------------------
const inspectionSchema = z.object({
  markNo: opt,
  type: z.enum(["ITP_HOLD", "BOLT_TORQUE", "ALIGNMENT", "VERTICALITY", "WELD_VISUAL", "PAINT_DFT", "FINAL"]),
  reference: opt,
  result: z.enum(["PENDING", "PASSED", "FAILED"]),
  inspectedAt: z.string().min(1),
  remarks: opt,
  boltSize: opt,
  specifiedTorqueNm: optNum,
  actualTorqueNm: optNum,
  boltCount: optNum,
  toleranceMm: optNum,
  measuredMm: optNum,
});

export async function recordInspection(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("inspections.record");
    const project = await requireProject();
    const d = inspectionSchema.parse(Object.fromEntries(fd));
    const member = await memberByMark(project.id, d.markNo);
    let result = d.result;
    // Objective acceptance where measurements are given.
    if (d.type === "BOLT_TORQUE" && d.specifiedTorqueNm && d.actualTorqueNm) result = d.actualTorqueNm >= d.specifiedTorqueNm ? "PASSED" : "FAILED";
    if ((d.type === "VERTICALITY" || d.type === "ALIGNMENT") && d.toleranceMm != null && d.measuredMm != null) result = Math.abs(d.measuredMm) <= d.toleranceMm ? "PASSED" : "FAILED";
    const insp = await prisma.$transaction(async (tx) => {
      const i = await tx.inspection.create({
        data: {
          projectId: project.id, memberId: member?.id ?? null, type: d.type, reference: d.reference, result, inspectedAt: parseDay(d.inspectedAt), inspectorId: user.id, remarks: d.remarks,
          boltSize: d.boltSize, specifiedTorqueNm: d.specifiedTorqueNm, actualTorqueNm: d.actualTorqueNm, boltCount: d.boltCount != null ? Math.round(d.boltCount) : null,
          toleranceMm: d.toleranceMm, measuredMm: d.measuredMm,
        },
      });
      await audit(tx, { userId: user.id, projectId: project.id, action: "INSPECTION_RECORDED", entity: "Inspection", entityId: i.id, details: { type: d.type, result, markNo: d.markNo } });
      return i;
    });
    revalidatePath("/qc/inspections");
    return `Inspection recorded: ${insp.result}${insp.result !== d.result ? " (computed from measurements)" : ""}.`;
  });
}

// ---- NCRs --------------------------------------------------------------------
const ncrSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(4000),
  severity: z.enum(["MINOR", "MAJOR", "CRITICAL"]),
  areaId: opt,
  markNo: opt,
  dueDate: opt,
});

export async function raiseNcr(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("ncr.raise");
    const project = await requireProject();
    const d = ncrSchema.parse(Object.fromEntries(fd));
    const member = await memberByMark(project.id, d.markNo);
    const ncr = await prisma.$transaction(async (tx) => {
      const number = await nextNumber(tx, "Ncr", project.id, "NCR");
      const n = await tx.ncr.create({
        data: { projectId: project.id, number, title: d.title, description: d.description, severity: d.severity, areaId: d.areaId ?? member?.areaId ?? null, memberId: member?.id ?? null, raisedById: user.id, dueDate: d.dueDate ? parseDay(d.dueDate) : null },
      });
      await audit(tx, { userId: user.id, projectId: project.id, action: "NCR_RAISED", entity: "Ncr", entityId: n.id, details: { number, severity: d.severity } });
      return n;
    });
    revalidatePath("/qc/ncr");
    return `${ncr.number} raised.`;
  });
}

export async function updateNcrStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("ncr.close");
    const project = await requireProject();
    const id = String(fd.get("id"));
    const status = z.enum(["OPEN", "UNDER_REVIEW", "CLOSED"]).parse(fd.get("status"));
    const disposition = String(fd.get("disposition") ?? "").trim() || null;
    const ncr = await prisma.ncr.findFirst({ where: { id, projectId: project.id } });
    if (!ncr) throw new Error("NCR not found.");
    if (status === "CLOSED" && !(disposition ?? ncr.disposition)) throw new Error("A disposition is required to close an NCR.");
    await prisma.$transaction(async (tx) => {
      await tx.ncr.update({ where: { id }, data: { status, disposition: disposition ?? ncr.disposition, closedAt: status === "CLOSED" ? new Date() : null } });
      await audit(tx, { userId: user.id, projectId: project.id, action: "NCR_STATUS", entity: "Ncr", entityId: id, details: { number: ncr.number, from: ncr.status, to: status, disposition } });
    });
    revalidatePath("/qc/ncr");
    return `${ncr.number} → ${status.replace("_", " ")}.`;
  });
}

// ---- Punch list --------------------------------------------------------------
const punchSchema = z.object({
  description: z.string().trim().min(3).max(1000),
  category: z.enum(["A", "B", "C"]),
  areaId: opt,
  markNo: opt,
  contractorId: opt,
  dueDate: opt,
});

export async function addPunch(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("punch.manage");
    const project = await requireProject();
    const d = punchSchema.parse(Object.fromEntries(fd));
    const member = await memberByMark(project.id, d.markNo);
    const p = await prisma.$transaction(async (tx) => {
      const number = await nextNumber(tx, "PunchItem", project.id, "PL");
      const item = await tx.punchItem.create({
        data: { projectId: project.id, number, description: d.description, category: d.category, areaId: d.areaId ?? member?.areaId ?? null, memberId: member?.id ?? null, contractorId: d.contractorId, raisedById: user.id, dueDate: d.dueDate ? parseDay(d.dueDate) : null },
      });
      await audit(tx, { userId: user.id, projectId: project.id, action: "PUNCH_ADDED", entity: "PunchItem", entityId: item.id, details: { number, category: d.category } });
      return item;
    });
    revalidatePath("/qc/punch");
    return `${p.number} added.`;
  });
}

export async function togglePunch(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("punch.manage");
    const project = await requireProject();
    const id = String(fd.get("id"));
    const item = await prisma.punchItem.findFirst({ where: { id, projectId: project.id } });
    if (!item) throw new Error("Punch item not found.");
    const status = item.status === "OPEN" ? "CLOSED" : "OPEN";
    await prisma.$transaction(async (tx) => {
      await tx.punchItem.update({ where: { id }, data: { status, closedAt: status === "CLOSED" ? new Date() : null } });
      await audit(tx, { userId: user.id, projectId: project.id, action: status === "CLOSED" ? "PUNCH_CLOSED" : "PUNCH_REOPENED", entity: "PunchItem", entityId: id, details: { number: item.number } });
    });
    revalidatePath("/qc/punch");
    return `${item.number} ${status.toLowerCase()}.`;
  });
}
