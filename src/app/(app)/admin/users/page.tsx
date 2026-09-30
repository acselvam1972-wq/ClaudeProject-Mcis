import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, permissionsFor, ROLE_LABELS } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { Badge, Card, Field } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { createUser, updateUser } from "../actions";
import type { Role } from "@prisma/client";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireUser();
  if (!can(me.role, "users.manage")) redirect("/admin");
  const users = await prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  const lastLogin = await prisma.auditLog.groupBy({ by: ["userId"], where: { action: "LOGIN" }, _max: { createdAt: true } });
  const roles = Object.keys(ROLE_LABELS) as Role[];
  return (
    <div className="space-y-4">
      <Card title={`Users (${users.length})`} bodyClass="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Last sign-in</th><th>Role · status · password reset</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                <td className="font-medium">{u.name}{u.id === me.id && <span className="ml-1 text-xs text-muted">(you)</span>}</td>
                <td className="text-sm">{u.email}</td>
                <td className="text-xs text-ink-2">{fmtDateTime(lastLogin.find((l) => l.userId === u.id)?._max.createdAt ?? null)}</td>
                <td>
                  <ActionForm action={updateUser} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <select className="input w-44 py-1" name="role" defaultValue={u.role} aria-label="Role">{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={u.active} /> Active</label>
                    <input className="input w-40 py-1" type="password" name="password" placeholder="New password" autoComplete="new-password" aria-label="New password" />
                    <SubmitButton variant="secondary" className="btn-sm">Save</SubmitButton>
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Add user">
          <ActionForm action={createUser} resetOnSuccess>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name *"><input className="input" name="name" required /></Field>
              <Field label="Email *"><input className="input" type="email" name="email" required /></Field>
              <Field label="Role *"><select className="input" name="role" defaultValue="VIEWER">{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>
              <Field label="Initial password *"><input className="input" type="password" name="password" required minLength={10} autoComplete="new-password" /></Field>
            </div>
            <p className="mt-2 text-xs text-muted">At least 10 characters, including a letter and a number. Ask the user to change it after first sign-in.</p>
            <div className="mt-3"><SubmitButton>Create user</SubmitButton></div>
          </ActionForm>
        </Card>
        <Card title="Role permissions" bodyClass="overflow-x-auto">
          <table className="table">
            <tbody>
              {roles.map((r) => (
                <tr key={r}>
                  <td className="font-medium whitespace-nowrap">{ROLE_LABELS[r]}</td>
                  <td className="flex flex-wrap gap-1">{permissionsFor(r).length ? permissionsFor(r).map((p) => <Badge key={p}>{p}</Badge>) : <span className="text-xs text-muted">Read-only (dashboards, registers, reports)</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
