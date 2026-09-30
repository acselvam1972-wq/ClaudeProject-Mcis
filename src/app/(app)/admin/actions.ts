"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { requireProject, PROJECT_COOKIE } from "@/lib/project";
import { audit } from "@/lib/audit";
import { runAction, type ActionState } from "@/lib/actions";
import { DEFAULT_STAGES, validateStageWeights } from "@/lib/progress";
import { parseDay } from "@/lib/format";

const projectSchema = z.object({
  code: z.string().trim().min(2).max(30).transform((s) => s.toUpperCase()),
  name: z.string().trim().min(3).max(200),
  client: z.string().trim().max(200).optional().transform((s) => s || null),
  location: z.string().trim().max(200).optional().transform((s) => s || null),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

export async function saveProject(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("project.manage");
    const d = projectSchema.parse(Object.fromEntries(fd));
    const startDate = parseDay(d.startDate);
    const endDate = parseDay(d.endDate);
    if (endDate <= startDate) throw new Error("Finish date must be after start date.");
    const id = String(fd.get("id") ?? "");
    if (id) {
      await prisma.project.update({ where: { id }, data: { ...d, startDate, endDate } });
      await audit(prisma, { userId: user.id, projectId: id, action: "PROJECT_UPDATED", entity: "Project", entityId: id, details: { code: d.code } });
      revalidatePath("/", "layout");
      return "Project updated.";
    }
    const p = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({ data: { ...d, startDate, endDate, stages: { create: DEFAULT_STAGES.map((s, i) => ({ ...s, sequence: i + 1 })) } } });
      await audit(tx, { userId: user.id, projectId: p.id, action: "PROJECT_CREATED", entity: "Project", entityId: p.id, details: { code: d.code } });
      return p;
    });
    (await cookies()).set(PROJECT_COOKIE, p.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    revalidatePath("/", "layout");
    return `Project ${p.code} created with default stages and selected. Add areas next.`;
  });
}

export async function saveStages(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("project.manage");
    const project = await requireProject();
    const stages = await prisma.stage.findMany({ where: { projectId: project.id }, orderBy: { sequence: "asc" } });
    const updated = stages.map((s) => ({
      id: s.id,
      code: s.code,
      name: String(fd.get(`name_${s.id}`) ?? s.name).trim() || s.name,
      weight: Number(fd.get(`weight_${s.id}`)),
      qcHold: fd.get(`qc_${s.id}`) === "on",
    }));
    const err = validateStageWeights(updated);
    if (err) throw new Error(err);
    await prisma.$transaction(async (tx) => {
      for (const s of updated) await tx.stage.update({ where: { id: s.id }, data: { name: s.name, weight: s.weight, qcHold: s.qcHold } });
      await audit(tx, {
        userId: user.id, projectId: project.id, action: "STAGES_UPDATED", entity: "Stage",
        details: { before: stages.map((s) => ({ code: s.code, weight: s.weight, qcHold: s.qcHold })), after: updated.map((s) => ({ code: s.code, weight: s.weight, qcHold: s.qcHold })) },
      });
    });
    revalidatePath("/", "layout");
    return "Stage configuration saved. Weighted progress has been recalculated.";
  });
}

export async function addStage(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("project.manage");
    const project = await requireProject();
    const entries = await prisma.progressEntry.count({ where: { member: { projectId: project.id } } });
    if (entries > 0) throw new Error("Stages can only be added before any progress is booked. Adjust names/weights instead.");
    const code = z.string().trim().min(2).max(12).regex(/^[A-Z0-9_]+$/i).parse(fd.get("code")).toUpperCase();
    const name = z.string().trim().min(2).max(60).parse(fd.get("name"));
    const max = await prisma.stage.aggregate({ where: { projectId: project.id }, _max: { sequence: true } });
    await prisma.stage.create({ data: { projectId: project.id, code, name, sequence: (max._max.sequence ?? 0) + 1, weight: 0 } });
    await audit(prisma, { userId: user.id, projectId: project.id, action: "STAGE_ADDED", entity: "Stage", details: { code } });
    revalidatePath("/admin");
    return `Stage ${code} added with 0% weight — rebalance weights to total 100%.`;
  });
}

export async function saveArea(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("project.manage");
    const project = await requireProject();
    const code = z.string().trim().min(1).max(20).parse(fd.get("code")).toUpperCase();
    const name = z.string().trim().min(1).max(120).parse(fd.get("name"));
    const a = await prisma.area.create({ data: { projectId: project.id, code, name } });
    await audit(prisma, { userId: user.id, projectId: project.id, action: "AREA_CREATED", entity: "Area", entityId: a.id, details: { code } });
    revalidatePath("/admin");
    return `Area ${code} added.`;
  });
}

export async function saveContractor(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("project.manage");
    const project = await requireProject();
    const name = z.string().trim().min(2).max(120).parse(fd.get("name"));
    const scope = String(fd.get("scope") ?? "").trim() || null;
    const c = await prisma.contractor.create({ data: { projectId: project.id, name, scope } });
    await audit(prisma, { userId: user.id, projectId: project.id, action: "CONTRACTOR_CREATED", entity: "Contractor", entityId: c.id, details: { name } });
    revalidatePath("/admin");
    return `Contractor ${name} added.`;
  });
}

// ---- Users -------------------------------------------------------------------
const ROLES = ["ADMIN", "PROJECT_MANAGER", "PLANNER", "SITE_ENGINEER", "QC_INSPECTOR", "VIEWER"] as const;
const password = z.string().min(10, "Password must be at least 10 characters").regex(/[A-Za-z]/, "Password needs a letter").regex(/[0-9]/, "Password needs a number");

export async function createUser(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await requirePermission("users.manage");
    const d = z.object({ email: z.email().transform((s) => s.toLowerCase()), name: z.string().trim().min(2).max(120), role: z.enum(ROLES), password }).parse(Object.fromEntries(fd));
    const u = await prisma.user.create({ data: { email: d.email, name: d.name, role: d.role, passwordHash: await bcrypt.hash(d.password, 12) } });
    await audit(prisma, { userId: admin.id, action: "USER_CREATED", entity: "User", entityId: u.id, details: { email: d.email, role: d.role } });
    revalidatePath("/admin/users");
    return `User ${d.email} created.`;
  });
}

export async function updateUser(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await requirePermission("users.manage");
    const id = String(fd.get("id"));
    const role = z.enum(ROLES).parse(fd.get("role"));
    const active = fd.get("active") === "on";
    const newPassword = String(fd.get("password") ?? "");
    if (id === admin.id && (role !== "ADMIN" || !active)) throw new Error("You cannot remove your own admin access or deactivate yourself.");
    const before = await prisma.user.findUniqueOrThrow({ where: { id } });
    await prisma.user.update({ where: { id }, data: { role, active, ...(newPassword ? { passwordHash: await bcrypt.hash(password.parse(newPassword), 12) } : {}) } });
    await audit(prisma, { userId: admin.id, action: "USER_UPDATED", entity: "User", entityId: id, details: { email: before.email, role: [before.role, role], active: [before.active, active], passwordReset: !!newPassword } });
    revalidatePath("/admin/users");
    return `${before.email} updated.`;
  });
}

export async function changeOwnPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const me = await requireUser();
    const current = String(fd.get("current") ?? "");
    const next = password.parse(String(fd.get("next") ?? ""));
    if (next !== String(fd.get("confirm") ?? "")) throw new Error("New passwords do not match.");
    const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await bcrypt.compare(current, u.passwordHash))) throw new Error("Current password is incorrect.");
    await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(next, 12) } });
    await audit(prisma, { userId: me.id, action: "PASSWORD_CHANGED", entity: "User", entityId: me.id });
    return "Password changed.";
  });
}
