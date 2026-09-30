import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCurrentProject } from "@/lib/project";
import { can } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { Badge, Card, Empty, Pagination } from "@/components/ui";

export const metadata = { title: "Audit trail" };
const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; user?: string; page?: string }> }) {
  const me = await requireUser();
  if (!can(me.role, "audit.view")) redirect("/admin");
  const project = await getCurrentProject();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.AuditLogWhereInput = { OR: [{ projectId: project?.id }, { projectId: null }] };
  if (sp.action) where.action = sp.action;
  if (sp.user) where.userId = sp.user;
  const [actions, users, total, logs] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { user: { select: { name: true } } } }),
  ]);
  return (
    <Card bodyClass="p-0" title={`Audit trail (${total.toLocaleString()} events)`}>
      <form method="get" className="flex flex-wrap gap-2 border-b border-line p-3">
        <select className="input w-auto" name="action" defaultValue={sp.action ?? ""} aria-label="Action"><option value="">All actions</option>{actions.map((a) => <option key={a.action}>{a.action}</option>)}</select>
        <select className="input w-auto" name="user" defaultValue={sp.user ?? ""} aria-label="User"><option value="">All users</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <button className="btn btn-secondary">Filter</button>
      </form>
      <div className="overflow-x-auto">
        {logs.length === 0 ? <Empty>No events.</Empty> : (
          <table className="table">
            <thead><tr><th>Time (UTC)</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-xs tabular">{fmtDateTime(l.createdAt)}</td>
                  <td className="text-xs">{l.user?.name ?? "system"}</td>
                  <td><Badge tone="info">{l.action}</Badge></td>
                  <td className="text-xs text-ink-2">{l.entity}</td>
                  <td className="max-w-xl"><code className="block truncate text-xs text-ink-2" title={JSON.stringify(l.details)}>{l.details ? JSON.stringify(l.details) : ""}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pageSize={PAGE} total={total} params={{ ...sp, page: undefined }} />
    </Card>
  );
}
