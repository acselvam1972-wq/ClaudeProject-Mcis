import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { can } from "@/lib/rbac";
import { fmtDate, todayUtc } from "@/lib/format";
import { Card, Empty, StatusBadge } from "@/components/ui";
import { ActionForm, InlineAction, SubmitButton } from "@/components/form";
import { raiseNcr, updateNcrStatus } from "../actions";

export const metadata = { title: "NCRs" };

export default async function NcrPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  const project = await requireProject();
  const { status } = await searchParams;
  const where: Prisma.NcrWhereInput = { projectId: project.id };
  if (status === "active") where.status = { not: "CLOSED" };
  else if (status) where.status = status as Prisma.NcrWhereInput["status"];
  const [ncrs, areas] = await Promise.all([
    prisma.ncr.findMany({ where, orderBy: { number: "desc" }, include: { area: { select: { code: true } }, member: { select: { id: true, markNo: true } }, raisedBy: { select: { name: true } } } }),
    prisma.area.findMany({ where: { projectId: project.id }, orderBy: { code: "asc" } }),
  ]);
  const today = todayUtc();
  const canClose = can(user.role, "ncr.close");
  return (
    <div className="space-y-4">
      <Card bodyClass="p-0" title={`Non-conformance reports (${ncrs.length})`}
        actions={
          <form method="get" className="flex gap-2">
            <select className="input w-auto py-1" name="status" defaultValue={status ?? ""} aria-label="Status"><option value="">All</option><option value="active">Open + under review</option><option>OPEN</option><option>UNDER_REVIEW</option><option>CLOSED</option></select>
            <button className="btn btn-secondary btn-sm">Filter</button>
          </form>
        }>
        <div className="overflow-x-auto">
          {ncrs.length === 0 ? <Empty>No NCRs.</Empty> : (
            <table className="table">
              <thead><tr><th>No.</th><th>Title</th><th>Severity</th><th>Area / mark</th><th>Raised</th><th>Due</th><th>Status</th><th>Disposition</th>{canClose && <th>Actions</th>}</tr></thead>
              <tbody>
                {ncrs.map((n) => {
                  const overdue = n.status !== "CLOSED" && n.dueDate && n.dueDate < today;
                  return (
                    <tr key={n.id} className="align-top">
                      <td className="font-medium">{n.number}</td>
                      <td><div className="font-medium">{n.title}</div><div className="max-w-md text-xs text-ink-2">{n.description}</div></td>
                      <td><StatusBadge value={n.severity} /></td>
                      <td className="text-xs">{n.area?.code ?? "—"}{n.member && <div><Link className="text-accent hover:underline" href={`/members/${n.member.id}`}>{n.member.markNo}</Link></div>}</td>
                      <td className="text-xs tabular">{fmtDate(n.raisedAt)}<div className="text-muted">{n.raisedBy.name}</div></td>
                      <td className={`text-xs tabular ${overdue ? "font-semibold text-critical-ink" : ""}`}>{fmtDate(n.dueDate)}{overdue && <div>overdue</div>}</td>
                      <td><StatusBadge value={n.status} />{n.closedAt && <div className="text-xs text-muted">{fmtDate(n.closedAt)}</div>}</td>
                      <td className="text-xs">{n.disposition ?? "—"}</td>
                      {canClose && (
                        <td className="whitespace-nowrap">
                          {n.status === "OPEN" && <InlineAction action={updateNcrStatus} fields={{ id: n.id, status: "UNDER_REVIEW" }} label="Start review" />}
                          {n.status !== "CLOSED" && (
                            <ActionForm action={updateNcrStatus} className="mt-1 flex gap-1">
                              <input type="hidden" name="id" value={n.id} />
                              <input type="hidden" name="status" value="CLOSED" />
                              <select className="input w-28 py-0.5 text-xs" name="disposition" defaultValue={n.disposition ?? ""} aria-label="Disposition">
                                <option value="" disabled>Disposition…</option><option>Use-as-is</option><option>Repair</option><option>Rework</option><option>Reject</option>
                              </select>
                              <SubmitButton className="btn-sm">Close</SubmitButton>
                            </ActionForm>
                          )}
                          {n.status === "CLOSED" && <InlineAction action={updateNcrStatus} fields={{ id: n.id, status: "OPEN" }} label="Reopen" />}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      {can(user.role, "ncr.raise") && (
        <Card title="Raise NCR">
          <ActionForm action={raiseNcr} resetOnSuccess>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <label className="col-span-2 block"><span className="label">Title *</span><input className="input" name="title" required minLength={3} /></label>
              <label className="block"><span className="label">Severity *</span><select className="input" name="severity"><option>MINOR</option><option>MAJOR</option><option>CRITICAL</option></select></label>
              <label className="block"><span className="label">Due date</span><input className="input" type="date" name="dueDate" /></label>
              <label className="block"><span className="label">Area</span><select className="input" name="areaId" defaultValue=""><option value="">—</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}</select></label>
              <label className="block"><span className="label">Mark no.</span><input className="input" name="markNo" /></label>
              <label className="col-span-2 block md:col-span-4"><span className="label">Description *</span><textarea className="input" name="description" rows={3} required minLength={3} /></label>
            </div>
            <div className="mt-3"><SubmitButton>Raise NCR</SubmitButton></div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
