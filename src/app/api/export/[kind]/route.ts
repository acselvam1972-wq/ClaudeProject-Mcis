import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProject } from "@/lib/project";
import { addSheet, newWorkbook, xlsxResponse } from "@/lib/excel";
import { currentStageCode, memberPercent } from "@/lib/progress";
import { fmtDate, parseDay, todayUtc } from "@/lib/format";
import { progressReportData } from "@/lib/report-data";

export const dynamic = "force-dynamic";

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const project = await getCurrentProject();
  if (!project) return Response.json({ error: "No project" }, { status: 404 });
  const { kind } = await params;
  const sp = req.nextUrl.searchParams;
  const stamp = fmtDate(todayUtc());
  const wb = newWorkbook();

  switch (kind) {
    case "mto-template": {
      addSheet(
        wb,
        "MTO",
        ["Mark No", "Area", "Type", "Profile", "Grade", "Drawing No", "Rev", "Length (mm)", "Qty", "Unit Weight (kg)", "Contractor"].map((h) => ({ header: h, key: h, width: 16 })),
        [{ "Mark No": "PR-01-CO001", Area: "PR-01", Type: "COLUMN", Profile: "UC 305x305x97", Grade: "S355JR", "Drawing No": "PR-01-GA-101", Rev: "0", "Length (mm)": 12000, Qty: 1, "Unit Weight (kg)": 1164, Contractor: "" }],
      );
      return xlsxResponse(wb, "steeltrack-mto-template.xlsx");
    }

    case "members": {
      const where: Prisma.MemberWhereInput = { projectId: project.id };
      if (sp.get("q")) where.OR = ["markNo", "drawingNo", "profile"].map((f) => ({ [f]: { contains: sp.get("q")!, mode: "insensitive" } }));
      if (sp.get("area")) where.areaId = sp.get("area")!;
      if (sp.get("type")) where.memberType = sp.get("type")!;
      if (sp.get("contractor")) where.contractorId = sp.get("contractor")!;
      if (sp.get("stage")) where.stages = sp.get("reached") === "no" ? { none: { stageId: sp.get("stage")!, qtyDone: { gt: 0 } } } : { some: { stageId: sp.get("stage")!, qtyDone: { gt: 0 } } };
      const [stages, members] = await Promise.all([
        prisma.stage.findMany({ where: { projectId: project.id }, orderBy: { sequence: "asc" } }),
        prisma.member.findMany({ where, orderBy: [{ area: { code: "asc" } }, { markNo: "asc" }], include: { area: true, contractor: true, stages: true } }),
      ]);
      const cols = [
        { header: "Mark No", key: "markNo", width: 16 }, { header: "Area", key: "area", width: 9 }, { header: "Type", key: "memberType", width: 12 },
        { header: "Profile", key: "profile", width: 20 }, { header: "Grade", key: "grade" }, { header: "Drawing", key: "drawingNo", width: 16 }, { header: "Rev", key: "revision", width: 6 },
        { header: "Length (mm)", key: "lengthMm", numFmt: "#,##0" }, { header: "Qty", key: "quantity", width: 6 }, { header: "Unit kg", key: "unitWeightKg", numFmt: "#,##0.0" },
        { header: "Total t", key: "totalT", numFmt: "0.000" }, { header: "Contractor", key: "contractor", width: 24 },
        ...stages.map((s) => ({ header: `${s.code} qty`, key: s.id, width: 10 })),
        { header: "Current stage", key: "current", width: 18 }, { header: "Progress %", key: "pct", numFmt: "0.0" },
      ];
      const rows = members.map((m) => {
        const q = new Map(m.stages.map((s) => [s.stageId, s.qtyDone]));
        return {
          ...m, area: m.area.code, contractor: m.contractor?.name, totalT: round((m.quantity * m.unitWeightKg) / 1000),
          ...Object.fromEntries(stages.map((s) => [s.id, q.get(s.id) ?? 0])),
          current: currentStageCode(m.quantity, stages, q), pct: round(memberPercent(m.quantity, stages, q), 1),
        };
      });
      addSheet(wb, "Members", cols, rows, `${project.code} — Member register (${stamp})`);
      return xlsxResponse(wb, `${project.code}-members-${stamp}.xlsx`);
    }

    case "progress-log": {
      const where: Prisma.ProgressEntryWhereInput = { member: { projectId: project.id, ...(sp.get("area") ? { areaId: sp.get("area")! } : {}), ...(sp.get("q") ? { markNo: { contains: sp.get("q")!, mode: "insensitive" } } : {}) } };
      if (sp.get("stage")) where.stageId = sp.get("stage")!;
      if (sp.get("status")) where.status = sp.get("status") as Prisma.ProgressEntryWhereInput["status"];
      if (sp.get("user")) where.enteredById = sp.get("user")!;
      const range: Prisma.DateTimeFilter = {};
      try {
        if (sp.get("from")) range.gte = parseDay(sp.get("from")!);
        if (sp.get("to")) range.lte = parseDay(sp.get("to")!);
      } catch {}
      if (range.gte || range.lte) where.workDate = range;
      const entries = await prisma.progressEntry.findMany({
        where, orderBy: [{ workDate: "desc" }, { createdAt: "desc" }], take: 100_000,
        include: { member: { include: { area: true } }, stage: true, enteredBy: true, reviewedBy: true },
      });
      addSheet(
        wb, "Progress log",
        [
          { header: "Work date", key: "workDate", width: 12 }, { header: "Mark No", key: "markNo", width: 16 }, { header: "Area", key: "area" }, { header: "Stage", key: "stage" },
          { header: "Qty", key: "quantity", width: 6 }, { header: "Tonnage", key: "t", numFmt: "0.000" }, { header: "Earned t", key: "earned", numFmt: "0.000" },
          { header: "Status", key: "status", width: 12 }, { header: "Entered by", key: "by", width: 24 }, { header: "Entered at", key: "at", width: 18 },
          { header: "Reviewed by", key: "rev", width: 24 }, { header: "Remarks", key: "remarks", width: 40 },
        ],
        entries.map((e) => ({
          workDate: fmtDate(e.workDate), markNo: e.member.markNo, area: e.member.area.code, stage: e.stage.code, quantity: e.quantity,
          t: round((e.quantity * e.member.unitWeightKg) / 1000), earned: round((e.quantity * e.member.unitWeightKg * e.stage.weight) / 100000),
          status: e.status, by: e.enteredBy.name, at: e.createdAt.toISOString().slice(0, 16).replace("T", " "), rev: e.reviewedBy?.name, remarks: [e.remarks, e.reviewNote].filter(Boolean).join(" · "),
        })),
        `${project.code} — Progress log (${stamp})`,
      );
      return xlsxResponse(wb, `${project.code}-progress-log-${stamp}.xlsx`);
    }

    case "member-card": {
      const m = await prisma.member.findFirst({ where: { id: sp.get("id") ?? "", projectId: project.id }, include: { entries: { orderBy: { workDate: "asc" }, include: { stage: true, enteredBy: true, reviewedBy: true } }, inspections: { include: { inspector: true } } } });
      if (!m) return Response.json({ error: "Not found" }, { status: 404 });
      addSheet(wb, "History", [
        { header: "Work date", key: "d", width: 12 }, { header: "Stage", key: "s" }, { header: "Qty", key: "q" }, { header: "Status", key: "st", width: 12 },
        { header: "Entered by", key: "by", width: 24 }, { header: "Reviewed by", key: "rv", width: 24 }, { header: "Remarks", key: "r", width: 40 },
      ], m.entries.map((e) => ({ d: fmtDate(e.workDate), s: e.stage.code, q: e.quantity, st: e.status, by: e.enteredBy.name, rv: e.reviewedBy?.name, r: [e.remarks, e.reviewNote].filter(Boolean).join(" · ") })), `${m.markNo} — progress history`);
      addSheet(wb, "Inspections", [
        { header: "Date", key: "d", width: 12 }, { header: "Type", key: "t", width: 14 }, { header: "Result", key: "r" }, { header: "Inspector", key: "i", width: 24 }, { header: "Remarks", key: "x", width: 40 },
      ], m.inspections.map((i) => ({ d: fmtDate(i.inspectedAt), t: i.type, r: i.result, i: i.inspector?.name, x: i.remarks })));
      return xlsxResponse(wb, `${m.markNo}-history.xlsx`);
    }

    case "shortages": {
      const stages = await prisma.stage.findMany({ where: { projectId: project.id, code: { in: ["FAB", "DISPATCH", "RECEIPT"] } } });
      const sid = (c: string) => stages.find((s) => s.code === c)?.id ?? "";
      const areaId = sp.get("area");
      const rows = await prisma.$queryRaw<{ markNo: string; area: string; memberType: string; drawingNo: string | null; quantity: number; unitWeightKg: number; fab: number; disp: number; recv: number }[]>`
        SELECT m."markNo", a.code AS area, m."memberType", m."drawingNo", m.quantity, m."unitWeightKg",
          COALESCE(f."qtyDone", 0)::int AS fab, COALESCE(d."qtyDone", 0)::int AS disp, COALESCE(r."qtyDone", 0)::int AS recv
        FROM "Member" m JOIN "Area" a ON a.id = m."areaId"
        LEFT JOIN "MemberStage" f ON f."memberId" = m.id AND f."stageId" = ${sid("FAB")}
        LEFT JOIN "MemberStage" d ON d."memberId" = m.id AND d."stageId" = ${sid("DISPATCH")}
        LEFT JOIN "MemberStage" r ON r."memberId" = m.id AND r."stageId" = ${sid("RECEIPT")}
        WHERE m."projectId" = ${project.id} ${areaId ? Prisma.sql`AND m."areaId" = ${areaId}` : Prisma.empty} AND COALESCE(r."qtyDone", 0) < m.quantity
        ORDER BY a.code, m."markNo"`;
      addSheet(wb, "Shortages", [
        { header: "Area", key: "area" }, { header: "Mark No", key: "markNo", width: 16 }, { header: "Type", key: "memberType", width: 12 }, { header: "Drawing", key: "drawingNo", width: 16 },
        { header: "Qty", key: "quantity" }, { header: "Fabricated", key: "fab" }, { header: "Dispatched", key: "disp" }, { header: "Received", key: "recv" },
        { header: "Short t", key: "short", numFmt: "0.000" }, { header: "Status", key: "status", width: 20 },
      ], rows.map((r) => ({ ...r, short: round(((r.quantity - r.recv) * r.unitWeightKg) / 1000), status: r.disp > r.recv ? "In transit" : r.fab > r.disp ? "At shop" : "Not fabricated" })), `${project.code} — Material not yet at site (${stamp})`);
      return xlsxResponse(wb, `${project.code}-shortages-${stamp}.xlsx`);
    }

    case "progress-report": {
      const d = await progressReportData(project.id);
      const t = d.curve.totals;
      addSheet(wb, "Summary", [{ header: "Metric", key: "k", width: 34 }, { header: "Value", key: "v", width: 22 }], [
        { k: "Project", v: `${project.code} — ${project.name}` }, { k: "Client", v: project.client }, { k: "Report date", v: d.reportDate },
        { k: "Total scope (t)", v: round(t.totalKg / 1000, 1) }, { k: "Marks / pieces", v: `${t.marks} / ${t.pieces}` },
        { k: "Overall progress % (weighted)", v: round(d.curve.actualToday, 2) }, { k: "Planned % to date", v: d.curve.plannedToday != null ? round(d.curve.plannedToday, 2) : "—" },
        { k: "Variance (pts)", v: d.curve.plannedToday != null ? round(d.curve.actualToday - d.curve.plannedToday, 2) : "—" },
        { k: "SPI", v: d.curve.plannedToday ? round(d.curve.actualToday / d.curve.plannedToday, 3) : "—" },
        { k: "Earned tonnage last 7 days (t)", v: round(d.week.earnedKg / 1000, 2) }, { k: "Erected last 7 days (t)", v: round(d.week.erectedKg / 1000, 2) },
        { k: "Open NCRs", v: d.ncrs.filter((n) => n.status !== "CLOSED").length }, { k: "Open punch items", v: d.punch.filter((p) => p.status === "OPEN").length },
      ], `Structural steel progress report — ${d.reportDate}`);
      addSheet(wb, "By stage", [
        { header: "Stage", key: "code" }, { header: "Name", key: "name", width: 28 }, { header: "Weight %", key: "weight" }, { header: "Completed t", key: "done", numFmt: "0.00" },
        { header: "Pending QC t", key: "pending", numFmt: "0.00" }, { header: "Complete %", key: "pct", numFmt: "0.0" },
      ], d.stages.map((s) => ({ ...s, done: s.doneKg / 1000, pending: s.pendingKg / 1000, pct: s.totalKg ? (s.doneKg / s.totalKg) * 100 : 0 })));
      addSheet(wb, "By area", [
        { header: "Area", key: "code" }, { header: "Name", key: "name", width: 34 }, { header: "Scope t", key: "total", numFmt: "0.0" }, { header: "Erected t", key: "erected", numFmt: "0.0" },
        { header: "Actual %", key: "pct", numFmt: "0.0" }, { header: "Planned %", key: "plannedPct", numFmt: "0.0" }, { header: "Variance", key: "var", numFmt: "0.0" },
      ], d.areas.map((a) => ({ ...a, total: a.totalKg / 1000, erected: a.erectedKg / 1000, var: a.plannedPct != null ? a.pct - a.plannedPct : null })));
      addSheet(wb, "By contractor", [{ header: "Contractor", key: "name", width: 30 }, { header: "Scope t", key: "total", numFmt: "0.0" }, { header: "Earned t", key: "earned", numFmt: "0.0" }, { header: "Progress %", key: "pct", numFmt: "0.0" }],
        d.contractors.map((c) => ({ ...c, total: c.totalKg / 1000, earned: c.earnedKg / 1000 })));
      addSheet(wb, "S-curve", [{ header: "Date", key: "date", width: 12 }, { header: "Planned %", key: "planned", numFmt: "0.00" }, { header: "Actual %", key: "actual", numFmt: "0.00" }], d.curve.points);
      addSheet(wb, "NCR register", [
        { header: "No.", key: "number" }, { header: "Title", key: "title", width: 36 }, { header: "Severity", key: "severity" }, { header: "Area", key: "area" }, { header: "Mark", key: "mark", width: 16 },
        { header: "Raised", key: "raised", width: 12 }, { header: "Due", key: "due", width: 12 }, { header: "Status", key: "status", width: 14 }, { header: "Disposition", key: "disposition", width: 14 }, { header: "Closed", key: "closed", width: 12 },
      ], d.ncrs.map((n) => ({ ...n, area: n.area?.code, mark: n.member?.markNo, raised: fmtDate(n.raisedAt), due: fmtDate(n.dueDate), closed: fmtDate(n.closedAt) })));
      addSheet(wb, "Punch list", [
        { header: "No.", key: "number" }, { header: "Cat.", key: "category", width: 6 }, { header: "Description", key: "description", width: 44 }, { header: "Area", key: "area" },
        { header: "Contractor", key: "contractor", width: 26 }, { header: "Due", key: "due", width: 12 }, { header: "Status", key: "status" },
      ], d.punch.map((p) => ({ ...p, area: p.area?.code, contractor: p.contractor?.name, due: fmtDate(p.dueDate) })));
      return xlsxResponse(wb, `${project.code}-progress-report-${stamp}.xlsx`);
    }
  }
  return Response.json({ error: "Unknown export" }, { status: 404 });
}
