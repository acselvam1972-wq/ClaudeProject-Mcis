import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProject } from "@/lib/project";
import { progressReportData } from "@/lib/report-data";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const BLUE: [number, number, number] = [42, 120, 214];
const ORANGE: [number, number, number] = [235, 104, 52];
const INK: [number, number, number] = [11, 11, 11];
const MUTED: [number, number, number] = [110, 108, 104];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const project = await getCurrentProject();
  if (!project) return Response.json({ error: "No project" }, { status: 404 });
  const d = await progressReportData(project.id);
  const t = d.curve.totals;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(22, 34, 47);
  doc.rect(0, 0, W, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text(`${project.code} — ${project.name}`, 10, 11.5);
  doc.setFontSize(9);
  doc.text(`Structural steel progress report · ${d.reportDate}`, W - 10, 11.5, { align: "right" });

  // KPI strip
  const kpis: [string, string][] = [
    ["Overall progress", `${d.curve.actualToday.toFixed(1)}%`],
    ["Planned to date", d.curve.plannedToday != null ? `${d.curve.plannedToday.toFixed(1)}%` : "—"],
    ["Variance", d.curve.plannedToday != null ? `${(d.curve.actualToday - d.curve.plannedToday).toFixed(1)} pts` : "—"],
    ["SPI", d.curve.plannedToday ? (d.curve.actualToday / d.curve.plannedToday).toFixed(2) : "—"],
    ["Scope", `${(t.totalKg / 1000).toFixed(1)} t`],
    ["Erected (7 days)", `${(d.week.erectedKg / 1000).toFixed(1)} t`],
    ["Open NCRs", String(d.ncrs.filter((n) => n.status !== "CLOSED").length)],
  ];
  const kw = (W - 20) / kpis.length;
  kpis.forEach(([k, v], i) => {
    const x = 10 + i * kw;
    doc.setTextColor(...MUTED);
    doc.setFontSize(8);
    doc.text(k, x, 27);
    doc.setTextColor(...INK);
    doc.setFontSize(15);
    doc.text(v, x, 34);
  });

  // S-curve (hand-drawn: time axis, planned dashed blue, actual solid orange)
  const cx = 10, cy = 42, cw = 150, ch = 70;
  doc.setDrawColor(225, 224, 217);
  doc.setLineWidth(0.2);
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  for (const p of [0, 25, 50, 75, 100]) {
    const y = cy + ch - (p / 100) * ch;
    doc.line(cx + 8, y, cx + cw, y);
    doc.text(`${p}%`, cx + 6, y + 1, { align: "right" });
  }
  const pts = d.curve.points;
  if (pts.length > 1) {
    const t0 = Date.parse(pts[0].date);
    const t1 = Date.parse(pts[pts.length - 1].date);
    const X = (date: string) => cx + 8 + ((Date.parse(date) - t0) / Math.max(1, t1 - t0)) * (cw - 8);
    const Y = (v: number) => cy + ch - (v / 100) * ch;
    const draw = (key: "planned" | "actual", color: [number, number, number], dash: boolean) => {
      const series = pts.filter((p) => p[key] !== undefined);
      doc.setDrawColor(...color);
      doc.setLineWidth(0.6);
      doc.setLineDashPattern(dash ? [1.5, 1] : [], 0);
      for (let i = 1; i < series.length; i++) doc.line(X(series[i - 1].date), Y(series[i - 1][key]!), X(series[i].date), Y(series[i][key]!));
      doc.setLineDashPattern([], 0);
    };
    draw("planned", BLUE, true);
    draw("actual", ORANGE, false);
    doc.setTextColor(...MUTED);
    doc.text(fmtDate(pts[0].date), cx + 8, cy + ch + 4);
    doc.text(fmtDate(pts[pts.length - 1].date), cx + cw, cy + ch + 4, { align: "right" });
    doc.setFontSize(8);
    doc.setTextColor(...BLUE);
    doc.text("- - Planned (baseline)", cx + 10, cy - 2);
    doc.setTextColor(...ORANGE);
    doc.text("— Actual", cx + 50, cy - 2);
  }

  // Stage table on the right
  autoTable(doc, {
    startY: 40,
    margin: { left: 170, right: 10 },
    head: [["Stage", "Wt %", "Done t", "Pending QC t", "Complete"]],
    body: d.stages.map((s) => [s.name, s.weight, (s.doneKg / 1000).toFixed(1), (s.pendingKg / 1000).toFixed(1), `${s.totalKg ? ((s.doneKg / s.totalKg) * 100).toFixed(1) : 0}%`]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [28, 92, 171] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
  });

  autoTable(doc, {
    startY: cy + ch + 10,
    margin: { left: 10, right: 10 },
    head: [["Area", "Description", "Scope t", "Erected t", "Actual %", "Planned %", "Variance"]],
    body: d.areas.map((a) => [a.code, a.name, (a.totalKg / 1000).toFixed(1), (a.erectedKg / 1000).toFixed(1), a.pct.toFixed(1), a.plannedPct != null ? a.plannedPct.toFixed(1) : "—", a.plannedPct != null ? (a.pct - a.plannedPct).toFixed(1) : "—"]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [28, 92, 171] },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
  });

  doc.addPage();
  doc.setTextColor(...INK);
  doc.setFontSize(12);
  doc.text("Open non-conformance reports", 10, 14);
  autoTable(doc, {
    startY: 18,
    head: [["No.", "Title", "Severity", "Area", "Raised", "Due", "Status"]],
    body: d.ncrs.filter((n) => n.status !== "CLOSED").map((n) => [n.number, n.title, n.severity, n.area?.code ?? "", fmtDate(n.raisedAt), fmtDate(n.dueDate), n.status.replace("_", " ")]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [28, 92, 171] },
  });
  const afterNcr = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFontSize(12);
  doc.text("Open punch items (Cat. A & B)", 10, afterNcr + 10);
  autoTable(doc, {
    startY: afterNcr + 14,
    head: [["No.", "Cat.", "Description", "Area", "Contractor", "Due"]],
    body: d.punch.filter((p) => p.status === "OPEN" && p.category !== "C").map((p) => [p.number, p.category, p.description, p.area?.code ?? "", p.contractor?.name ?? "", fmtDate(p.dueDate)]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [28, 92, 171] },
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Generated by SteelTrack for ${user.name} · page ${i} of ${pages}`, W - 10, doc.internal.pageSize.getHeight() - 5, { align: "right" });
  }

  const buf = doc.output("arraybuffer");
  return new Response(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${project.code}-progress-report-${d.reportDate}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
