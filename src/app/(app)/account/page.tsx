import { requireUser } from "@/lib/auth";
import { ROLE_LABELS, permissionsFor } from "@/lib/rbac";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { changeOwnPassword } from "../admin/actions";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="My account" subtitle={`${user.name} · ${user.email}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Change password">
          <ActionForm action={changeOwnPassword} resetOnSuccess>
            <div className="space-y-3">
              <Field label="Current password"><input className="input" type="password" name="current" required autoComplete="current-password" /></Field>
              <Field label="New password"><input className="input" type="password" name="next" required minLength={10} autoComplete="new-password" /></Field>
              <Field label="Confirm new password"><input className="input" type="password" name="confirm" required minLength={10} autoComplete="new-password" /></Field>
            </div>
            <div className="mt-3"><SubmitButton>Change password</SubmitButton></div>
          </ActionForm>
        </Card>
        <Card title={`Role: ${ROLE_LABELS[user.role]}`}>
          <div className="flex flex-wrap gap-1">{permissionsFor(user.role).map((p) => <Badge key={p}>{p}</Badge>)}</div>
          {permissionsFor(user.role).length === 0 && <p className="text-sm text-ink-2">Read-only access to dashboards, registers and reports.</p>}
        </Card>
      </div>
    </>
  );
}
