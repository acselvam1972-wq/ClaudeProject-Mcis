import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { can } from "@/lib/rbac";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import { Card, Empty } from "@/components/ui";
import { QueueForm } from "./queue-form";
import { reviewEntries } from "./actions";

export const metadata = { title: "QC Approval Queue" };

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ stage?: string; area?: string }> }) {
  const user = await requireUser();
  const project = await requireProject();
  const sp = await searchParams;
  const [stages, areas, entries] = await Promise.all([
    prisma.stage.findMany({ where: { projectId: project.id, qcHold: true }, orderBy: { sequence: "asc" } }),
    prisma.area.findMany({ where: { projectId: project.id }, orderBy: { code: "asc" } }),
    prisma.progressEntry.findMany({
      where: { status: "PENDING_QC", member: { projectId: project.id, ...(sp.area ? { areaId: sp.area } : {}) }, ...(sp.stage ? { stageId: sp.stage } : {}) },
      orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
      take: 300,
      include: { member: { select: { id: true, markNo: true, unitWeightKg: true, memberType: true, area: { select: { code: true } }, inspections: { select: { type: true, result: true }, orderBy: { inspectedAt: "desc" } } } }, stage: true, enteredBy: { select: { name: true } } },
    }),
  ]);
  const canApprove = can(user.role, "qc.approve");
  return (
    <Card bodyClass="p-0" title={`Pending hold-point approvals (${entries.length}${entries.length === 300 ? "+" : ""})`}
      actions={
        <form method="get" className="flex gap-2">
          <select className="input w-auto py-1" name="stage" defaultValue={sp.stage ?? ""} aria-label="Stage"><option value="">All QC stages</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}</select>
          <select className="input w-auto py-1" name="area" defaultValue={sp.area ?? ""} aria-label="Area"><option value="">All areas</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}</select>
          <button className="btn btn-secondary btn-sm">Filter</button>
        </form>
      }>
      {entries.length === 0 ? <Empty>Nothing waiting for QC. ✓</Empty> : (
        <QueueForm action={reviewEntries} canApprove={canApprove}>
          <div className="max-h-[65vh] overflow-auto">
            <table className="table">
              <thead><tr>{canApprove && <th className="w-8" />}<th>Work date</th><th>Mark</th><th>Area</th><th>Stage</th><th className="num">Qty</th><th className="num">Tonnage</th><th>Latest inspections</th><th>Submitted by</th><th>Remarks</th></tr></thead>
              <tbody>
                {entries.map((e) => {
                  const insp = e.member.inspections.slice(0, 2);
                  return (
                    <tr key={e.id}>
                      {canApprove && <td><input type="checkbox" name="ids" value={e.id} aria-label={`Select ${e.member.markNo}`} /></td>}
                      <td className="tabular">{fmtDate(e.workDate)}</td>
                      <td><Link className="font-medium text-accent hover:underline" href={`/members/${e.member.id}`}>{e.member.markNo}</Link><div className="text-xs text-muted">{e.member.memberType}</div></td>
                      <td>{e.member.area.code}</td>
                      <td>{e.stage.code}</td>
                      <td className="num">{e.quantity}</td>
                      <td className="num">{fmtNum((e.quantity * e.member.unitWeightKg) / 1000, 3)} t</td>
                      <td className="text-xs">{insp.length ? insp.map((i) => <div key={i.type + i.result} className={i.result === "FAILED" ? "text-critical-ink" : ""}>{i.type.replace(/_/g, " ")}: {i.result}</div>) : <span className="text-muted">none</span>}</td>
                      <td className="text-xs">{e.enteredBy.name}<div className="text-muted">{fmtDateTime(e.createdAt)}</div></td>
                      <td className="max-w-56 truncate text-xs text-ink-2">{e.remarks}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </QueueForm>
      )}
      {!canApprove && <p className="border-t border-line p-3 text-xs text-muted">Read-only: only QC inspectors can approve hold points.</p>}
    </Card>
  );
}
