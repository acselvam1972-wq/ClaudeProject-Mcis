import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { can } from "@/lib/rbac";
import { fmtDate, todayUtc } from "@/lib/format";
import { Card, Empty, StatusBadge } from "@/components/ui";
import { ActionForm, InlineAction, SubmitButton } from "@/components/form";
import { addPunch, togglePunch } from "../actions";

export const metadata = { title: "Punch List" };

export default async function PunchPage({ searchParams }: { searchParams: Promise<{ status?: string; category?: string; area?: string }> }) {
  const user = await requireUser();
  const project = await requireProject();
  const sp = await searchParams;
  const where: Prisma.PunchItemWhereInput = { projectId: project.id, status: sp.status === "CLOSED" ? "CLOSED" : sp.status === "all" ? undefined : "OPEN" };
  if (sp.category) where.category = sp.category as Prisma.PunchItemWhereInput["category"];
  if (sp.area) where.areaId = sp.area;
  const [items, areas, contractors] = await Promise.all([
    prisma.punchItem.findMany({ where, orderBy: [{ category: "asc" }, { number: "asc" }], include: { area: { select: { code: true } }, member: { select: { id: true, markNo: true } }, contractor: { select: { name: true } } } }),
    prisma.area.findMany({ where: { projectId: project.id }, orderBy: { code: "asc" } }),
    prisma.contractor.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } }),
  ]);
  const today = todayUtc();
  const editable = can(user.role, "punch.manage");
  return (
    <div className="space-y-4">
      <Card bodyClass="p-0" title={`Punch items (${items.length})`}
        actions={
          <form method="get" className="flex gap-2">
            <select className="input w-auto py-1" name="status" defaultValue={sp.status ?? "OPEN"} aria-label="Status"><option value="OPEN">Open</option><option value="CLOSED">Closed</option><option value="all">All</option></select>
            <select className="input w-auto py-1" name="category" defaultValue={sp.category ?? ""} aria-label="Category"><option value="">All cat.</option><option value="A">Cat. A</option><option value="B">Cat. B</option><option value="C">Cat. C</option></select>
            <select className="input w-auto py-1" name="area" defaultValue={sp.area ?? ""} aria-label="Area"><option value="">All areas</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}</select>
            <button className="btn btn-secondary btn-sm">Filter</button>
          </form>
        }>
        <p className="border-b border-line px-4 py-2 text-xs text-muted">Cat. A — must clear before mechanical completion · Cat. B — before handover · Cat. C — cosmetic / post-handover.</p>
        <div className="overflow-x-auto">
          {items.length === 0 ? <Empty>No punch items.</Empty> : (
            <table className="table">
              <thead><tr><th>No.</th><th>Cat.</th><th>Description</th><th>Area / mark</th><th>Contractor</th><th>Due</th><th>Status</th>{editable && <th />}</tr></thead>
              <tbody>
                {items.map((p) => {
                  const overdue = p.status === "OPEN" && p.dueDate && p.dueDate < today;
                  return (
                    <tr key={p.id}>
                      <td className="font-medium">{p.number}</td>
                      <td><StatusBadge value={p.category} /></td>
                      <td>{p.description}</td>
                      <td className="text-xs">{p.area?.code ?? "—"}{p.member && <div><Link className="text-accent hover:underline" href={`/members/${p.member.id}`}>{p.member.markNo}</Link></div>}</td>
                      <td className="text-xs">{p.contractor?.name ?? "—"}</td>
                      <td className={`text-xs tabular ${overdue ? "font-semibold text-critical-ink" : ""}`}>{fmtDate(p.dueDate)}{overdue && " · overdue"}</td>
                      <td><StatusBadge value={p.status} /></td>
                      {editable && <td><InlineAction action={togglePunch} fields={{ id: p.id }} label={p.status === "OPEN" ? "Close" : "Reopen"} /></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      {editable && (
        <Card title="Add punch item">
          <ActionForm action={addPunch} resetOnSuccess>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <label className="col-span-2 block md:col-span-6"><span className="label">Description *</span><input className="input" name="description" required minLength={3} /></label>
              <label className="block"><span className="label">Category *</span><select className="input" name="category" defaultValue="B"><option>A</option><option>B</option><option>C</option></select></label>
              <label className="block"><span className="label">Area</span><select className="input" name="areaId" defaultValue=""><option value="">—</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}</select></label>
              <label className="block"><span className="label">Mark no.</span><input className="input" name="markNo" /></label>
              <label className="block"><span className="label">Contractor</span><select className="input" name="contractorId" defaultValue=""><option value="">—</option>{contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="block"><span className="label">Due date</span><input className="input" type="date" name="dueDate" /></label>
            </div>
            <div className="mt-3"><SubmitButton>Add item</SubmitButton></div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
