"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { audit } from "@/lib/audit";
import { runAction, type ActionState } from "@/lib/actions";
import { parseCsv, parseMtoRows } from "@/lib/mto";

const memberSchema = z.object({
  markNo: z.string().trim().min(1).max(60).transform((s) => s.toUpperCase()),
  areaId: z.string().min(1, "Area is required"),
  contractorId: z.string().optional().transform((s) => s || null),
  memberType: z.string().trim().min(1).transform((s) => s.toUpperCase()),
  profile: z.string().trim().optional().transform((s) => s || null),
  grade: z.string().trim().optional().transform((s) => s || null),
  drawingNo: z.string().trim().optional().transform((s) => s || null),
  revision: z.string().trim().optional().transform((s) => s || null),
  lengthMm: z.string().optional().transform((s, ctx) => {
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) ctx.addIssue({ code: "custom", message: "Length must be ≥ 0" });
    return n;
  }),
  quantity: z.coerce.number().int().min(1),
  unitWeightKg: z.coerce.number().positive(),
});

function formObject(fd: FormData) {
  return Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
}

/** Largest quantity already booked (approved or pending) at any stage for a member. */
async function maxBooked(memberId: string) {
  const [approved, pending] = await Promise.all([
    prisma.memberStage.aggregate({ where: { memberId }, _max: { qtyDone: true } }),
    prisma.progressEntry.groupBy({ by: ["stageId"], where: { memberId, status: "PENDING_QC" }, _sum: { quantity: true } }),
  ]);
  const stageRows = await prisma.memberStage.findMany({ where: { memberId } });
  let max = approved._max.qtyDone ?? 0;
  for (const p of pending) {
    const done = stageRows.find((r) => r.stageId === p.stageId)?.qtyDone ?? 0;
    max = Math.max(max, done + (p._sum.quantity ?? 0));
  }
  return max;
}

export async function saveMember(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("members.edit");
    const project = await requireProject();
    const id = String(fd.get("id") ?? "");
    const data = memberSchema.parse(formObject(fd));
    const area = await prisma.area.findFirst({ where: { id: data.areaId, projectId: project.id } });
    if (!area) throw new Error("Area not found.");
    if (data.contractorId && !(await prisma.contractor.findFirst({ where: { id: data.contractorId, projectId: project.id } }))) {
      throw new Error("Contractor not found.");
    }
    if (id) {
      const existing = await prisma.member.findFirst({ where: { id, projectId: project.id } });
      if (!existing) throw new Error("Member not found.");
      const booked = await maxBooked(id);
      if (data.quantity < booked) throw new Error(`Quantity cannot be less than already-booked quantity (${booked}).`);
      await prisma.$transaction(async (tx) => {
        await tx.member.update({ where: { id }, data });
        await audit(tx, { userId: user.id, projectId: project.id, action: "MEMBER_UPDATED", entity: "Member", entityId: id, details: { before: { quantity: existing.quantity, unitWeightKg: existing.unitWeightKg, revision: existing.revision }, after: { quantity: data.quantity, unitWeightKg: data.unitWeightKg, revision: data.revision } } });
      });
      revalidatePath(`/members/${id}`);
      return `Member ${data.markNo} updated.`;
    }
    const created = await prisma.$transaction(async (tx) => {
      const m = await tx.member.create({ data: { ...data, projectId: project.id } });
      await audit(tx, { userId: user.id, projectId: project.id, action: "MEMBER_CREATED", entity: "Member", entityId: m.id, details: { markNo: m.markNo } });
      return m;
    });
    revalidatePath("/members");
    return `Member ${created.markNo} created.`;
  });
}

export async function deleteMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const user = await requirePermission("members.edit");
    const project = await requireProject();
    const id = String(fd.get("id"));
    const m = await prisma.member.findFirst({ where: { id, projectId: project.id }, include: { _count: { select: { entries: true } } } });
    if (!m) throw new Error("Member not found.");
    if (m._count.entries > 0) throw new Error("Members with recorded progress cannot be deleted. Reverse the progress first or mark the revision as deleted.");
    await prisma.$transaction(async (tx) => {
      await tx.member.delete({ where: { id } });
      await audit(tx, { userId: user.id, projectId: project.id, action: "MEMBER_DELETED", entity: "Member", entityId: id, details: { markNo: m.markNo } });
    });
    return "deleted";
  });
  if (result.ok) redirect("/members");
  return result;
}

async function readSheet(file: File): Promise<{ headers: string[]; rows: unknown[][] }> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith(".csv")) {
    const all = parseCsv(buf.toString("utf8"));
    return { headers: all[0] ?? [], rows: all.slice(1) };
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Workbook has no sheets.");
  const out: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const vals = (row.values as unknown[]).slice(1).map((v) => {
      if (v && typeof v === "object") {
        if ("result" in v) return (v as { result: unknown }).result; // formula
        if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
        if ("text" in v) return (v as { text: string }).text;
      }
      return v;
    });
    out.push(vals);
  });
  return { headers: (out[0] ?? []).map((h) => String(h ?? "")), rows: out.slice(1) };
}

export async function importMto(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("members.edit");
    const project = await requireProject();
    const file = fd.get("file");
    const commit = fd.get("mode") === "import";
    const createAreas = fd.get("createAreas") === "on";
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose an .xlsx or .csv file.");
    if (file.size > 10 * 1024 * 1024) throw new Error("File is larger than 10 MB.");
    if (!/\.(xlsx|csv)$/i.test(file.name)) throw new Error("Only .xlsx and .csv files are supported.");

    const { headers, rows: raw } = await readSheet(file);
    const { rows, issues } = parseMtoRows(headers, raw);

    const [areas, contractors, existing] = await Promise.all([
      prisma.area.findMany({ where: { projectId: project.id } }),
      prisma.contractor.findMany({ where: { projectId: project.id } }),
      prisma.member.findMany({ where: { projectId: project.id }, select: { id: true, markNo: true } }),
    ]);
    const areaByCode = new Map(areas.map((a) => [a.code.toUpperCase(), a]));
    const contractorByName = new Map(contractors.map((c) => [c.name.toLowerCase(), c]));
    const existingByMark = new Map(existing.map((m) => [m.markNo, m]));

    const missingAreas = [...new Set(rows.map((r) => r.areaCode).filter((c) => !areaByCode.has(c)))];
    if (missingAreas.length && !createAreas) {
      issues.push({ row: 0, message: `Unknown area code(s): ${missingAreas.join(", ")} — create them in Admin or tick “create missing areas”.` });
    }
    const missingContractors = [...new Set(rows.map((r) => r.contractor).filter((c): c is string => !!c && !contractorByName.has(c.toLowerCase())))];
    if (missingContractors.length) issues.push({ row: 0, message: `Unknown contractor(s): ${missingContractors.join(", ")}` });

    // Quantity reductions below booked progress are not allowed.
    const updates = rows.filter((r) => existingByMark.has(r.markNo));
    if (updates.length) {
      const booked = await prisma.$queryRaw<{ markNo: string; booked: number }[]>`
        SELECT m."markNo", COALESCE(MAX(COALESCE(ms."qtyDone", 0) + COALESCE(p.q, 0)), 0)::int AS booked
        FROM "Member" m
        JOIN "Stage" s ON s."projectId" = m."projectId"
        LEFT JOIN "MemberStage" ms ON ms."memberId" = m.id AND ms."stageId" = s.id
        LEFT JOIN (SELECT "memberId", "stageId", SUM("quantity") AS q FROM "ProgressEntry" WHERE "status" = 'PENDING_QC' GROUP BY 1, 2) p
          ON p."memberId" = m.id AND p."stageId" = s.id
        WHERE m."projectId" = ${project.id} GROUP BY m."markNo"`;
      const bookedBy = new Map(booked.map((b) => [b.markNo, b.booked]));
      for (const r of updates) {
        const b = bookedBy.get(r.markNo) ?? 0;
        if (r.quantity < b) issues.push({ row: 0, message: `${r.markNo}: qty ${r.quantity} is below already-completed qty ${b}.` });
      }
    }

    const totalKg = rows.reduce((s, r) => s + r.quantity * r.unitWeightKg, 0);
    const summary = `${rows.length} valid rows (${(totalKg / 1000).toFixed(2)} t): ${rows.length - updates.length} new, ${updates.length} updates.`;
    if (issues.length) {
      const shown = issues.slice(0, 25).map((i) => (i.row ? `Row ${i.row}: ${i.message}` : i.message));
      throw new Error(`${issues.length} issue(s) found — nothing imported.\n${summary}\n${shown.join("\n")}${issues.length > 25 ? `\n…and ${issues.length - 25} more` : ""}`);
    }
    if (!commit) return `Validation passed. ${summary} Choose “Import” to commit.`;

    await prisma.$transaction(
      async (tx) => {
        for (const code of missingAreas) {
          const a = await tx.area.create({ data: { projectId: project.id, code, name: code } });
          areaByCode.set(code, a);
        }
        for (const r of rows) {
          const data = {
            areaId: areaByCode.get(r.areaCode)!.id,
            contractorId: r.contractor ? contractorByName.get(r.contractor.toLowerCase())!.id : null,
            memberType: r.memberType,
            profile: r.profile ?? null,
            grade: r.grade ?? null,
            drawingNo: r.drawingNo ?? null,
            revision: r.revision ?? null,
            lengthMm: r.lengthMm ?? null,
            quantity: r.quantity,
            unitWeightKg: r.unitWeightKg,
          };
          await tx.member.upsert({
            where: { projectId_markNo: { projectId: project.id, markNo: r.markNo } },
            create: { ...data, projectId: project.id, markNo: r.markNo },
            update: data,
          });
        }
        await audit(tx, { userId: user.id, projectId: project.id, action: "MTO_IMPORTED", entity: "Member", details: { file: file.name, rows: rows.length, updates: updates.length, createdAreas: missingAreas } });
      },
      { timeout: 120_000 },
    );
    revalidatePath("/members");
    return `Imported ${file.name}. ${summary}${missingAreas.length ? ` Created areas: ${missingAreas.join(", ")}.` : ""}`;
  });
}
