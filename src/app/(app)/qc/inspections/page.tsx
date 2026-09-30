import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { can } from "@/lib/rbac";
import { fmtDate, todayUtc } from "@/lib/format";
import { Card, Empty, Pagination, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { InspectionFields } from "./inspection-fields";
import { recordInspection } from "../actions";

export const metadata = { title: "Inspections" };
const PAGE = 50;

export default async function InspectionsPage({ searchParams }: { searchParams: Promise<{ type?: string; result?: string; q?: string; page?: string }> }) {
  const user = await requireUser();
  const project = await requireProject();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.InspectionWhereInput = { projectId: project.id };
  if (sp.type) where.type = sp.type;
  if (sp.result) where.result = sp.result as Prisma.InspectionWhereInput["result"];
  if (sp.q) where.member = { markNo: { contains: sp.q, mode: "insensitive" } };
  const [total, rows, byType] = await Promise.all([
    prisma.inspection.count({ where }),
    prisma.inspection.findMany({ where, orderBy: [{ inspectedAt: "desc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE, take: PAGE, include: { member: { select: { id: true, markNo: true } }, inspector: { select: { name: true } } } }),
    prisma.inspection.groupBy({ by: ["type", "result"], where: { projectId: project.id }, _count: true }),
  ]);
  const types = [...new Set(byType.map((b) => b.type))].sort();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {types.map((t) => {
          const c = (r: string) => byType.find((b) => b.type === t && b.result === r)?._count ?? 0;
          const all = c("PASSED") + c("FAILED") + c("PENDING");
          return (
            <div key={t} className="rounded-lg border border-line bg-surface px-4 py-3">
              <div className="text-xs font-medium text-ink-2">{t.replace(/_/g, " ")}</div>
              <div className="mt-1 text-xl font-semibold">{all ? `${((c("PASSED") / all) * 100).toFixed(1)}%` : "—"} <span className="text-xs font-normal text-muted">pass rate</span></div>
              <div className="text-xs text-muted">{c("PASSED")} passed · <span className={c("FAILED") ? "text-critical-ink" : ""}>{c("FAILED")} failed</span> · {c("PENDING")} pending</div>
            </div>
          );
        })}
      </div>
      {can(user.role, "inspections.record") && (
        <Card title="Record inspection">
          <ActionForm action={recordInspection} resetOnSuccess>
            <InspectionFields today={fmtDate(todayUtc())} />
            <div className="mt-3"><SubmitButton>Save inspection</SubmitButton></div>
          </ActionForm>
        </Card>
      )}
      <Card bodyClass="p-0" title={`Inspection register (${total})`}>
        <form method="get" className="flex flex-wrap gap-2 border-b border-line p-3">
          <input className="input w-40" name="q" placeholder="Mark no." defaultValue={sp.q} />
          <select className="input w-auto" name="type" defaultValue={sp.type ?? ""} aria-label="Type"><option value="">All types</option>{types.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select>
          <select className="input w-auto" name="result" defaultValue={sp.result ?? ""} aria-label="Result"><option value="">Any result</option><option>PASSED</option><option>FAILED</option><option>PENDING</option></select>
          <button className="btn btn-secondary">Filter</button>
        </form>
        <div className="overflow-x-auto">
          {rows.length === 0 ? <Empty>No inspections.</Empty> : (
            <table className="table">
              <thead><tr><th>Date</th><th>Type</th><th>Ref.</th><th>Mark</th><th>Measurement</th><th>Result</th><th>Inspector</th><th>Remarks</th></tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    <td className="tabular">{fmtDate(i.inspectedAt)}</td>
                    <td className="text-xs">{i.type.replace(/_/g, " ")}</td>
                    <td className="text-xs text-ink-2">{i.reference}</td>
                    <td>{i.member ? <Link className="text-accent hover:underline" href={`/members/${i.member.id}`}>{i.member.markNo}</Link> : "—"}</td>
                    <td className="text-xs tabular">
                      {i.specifiedTorqueNm != null && `${i.boltCount ?? "?"}× ${i.boltSize ?? ""} · ${i.actualTorqueNm} / ${i.specifiedTorqueNm} Nm`}
                      {i.toleranceMm != null && `${i.measuredMm} mm (tol ±${i.toleranceMm})`}
                    </td>
                    <td><StatusBadge value={i.result} /></td>
                    <td className="text-xs">{i.inspector?.name}</td>
                    <td className="max-w-64 truncate text-xs text-ink-2">{i.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Pagination page={page} pageSize={PAGE} total={total} params={{ ...sp, page: undefined }} />
      </Card>
    </div>
  );
}
