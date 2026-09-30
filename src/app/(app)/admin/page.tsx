import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCurrentProject } from "@/lib/project";
import { can } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { stageWeightTotal } from "@/lib/progress";
import { Card, Field } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { addStage, saveArea, saveContractor, saveProject, saveStages } from "./actions";

export const metadata = { title: "Project setup" };

export default async function AdminPage() {
  const user = await requireUser();
  if (!can(user.role, "project.manage")) redirect(can(user.role, "users.manage") ? "/admin/users" : "/admin/audit");
  const project = await getCurrentProject();
  const [stages, areas, contractors] = project
    ? await Promise.all([
        prisma.stage.findMany({ where: { projectId: project.id }, orderBy: { sequence: "asc" } }),
        prisma.area.findMany({ where: { projectId: project.id }, orderBy: { code: "asc" }, include: { _count: { select: { members: true } } } }),
        prisma.contractor.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" }, include: { _count: { select: { members: true } } } }),
      ])
    : [[], [], []];

  const projectFields = (p?: typeof project) => (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Field label="Code *"><input className="input" name="code" required defaultValue={p?.code} /></Field>
      <Field label="Name *" className="md:col-span-2"><input className="input" name="name" required defaultValue={p?.name} /></Field>
      <Field label="Client"><input className="input" name="client" defaultValue={p?.client ?? ""} /></Field>
      <Field label="Location"><input className="input" name="location" defaultValue={p?.location ?? ""} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start *"><input className="input" type="date" name="startDate" required defaultValue={p ? fmtDate(p.startDate) : ""} /></Field>
        <Field label="Finish *"><input className="input" type="date" name="endDate" required defaultValue={p ? fmtDate(p.endDate) : ""} /></Field>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {project && (
        <Card title={`Project — ${project.code}`}>
          <ActionForm action={saveProject}>
            <input type="hidden" name="id" value={project.id} />
            {projectFields(project)}
            <div className="mt-3"><SubmitButton>Save project</SubmitButton></div>
          </ActionForm>
        </Card>
      )}

      {project && (
        <Card title="Progress measurement stages" actions={<span className="text-xs text-muted">Current total: {stageWeightTotal(stages)}%</span>}>
          <ActionForm action={saveStages}>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>#</th><th>Code</th><th>Name</th><th className="w-32">Weight %</th><th>QC hold point</th></tr></thead>
                <tbody>
                  {stages.map((s) => (
                    <tr key={s.id}>
                      <td className="text-muted">{s.sequence}</td>
                      <td className="font-medium">{s.code}</td>
                      <td><input className="input" name={`name_${s.id}`} defaultValue={s.name} /></td>
                      <td><input className="input text-right" type="number" step="0.5" min={0} max={100} name={`weight_${s.id}`} defaultValue={s.weight} /></td>
                      <td><label className="flex items-center gap-2 text-sm"><input type="checkbox" name={`qc_${s.id}`} defaultChecked={s.qcHold} /> Requires QC approval</label></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">Weights must total 100%. Changing weights re-weights all historical progress (the S-curve is recomputed). Stage codes FAB, DISPATCH, RECEIPT and ERECT drive material tracking.</p>
            <div className="mt-3"><SubmitButton>Save stages</SubmitButton></div>
          </ActionForm>
          <ActionForm action={addStage} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
            <Field label="New stage code"><input className="input w-32" name="code" placeholder="GROUT" /></Field>
            <Field label="Name"><input className="input w-56" name="name" placeholder="Base plate grouting" /></Field>
            <SubmitButton variant="secondary">Add stage</SubmitButton>
          </ActionForm>
        </Card>
      )}

      {project && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={`Areas / units (${areas.length})`}>
            <table className="table">
              <thead><tr><th>Code</th><th>Name</th><th className="num">Members</th></tr></thead>
              <tbody>{areas.map((a) => <tr key={a.id}><td className="font-medium">{a.code}</td><td>{a.name}</td><td className="num">{a._count.members}</td></tr>)}</tbody>
            </table>
            <ActionForm action={saveArea} resetOnSuccess className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="Code"><input className="input w-28" name="code" required placeholder="PR-03" /></Field>
              <Field label="Name" className="flex-1"><input className="input" name="name" required placeholder="Tank farm pipe rack" /></Field>
              <SubmitButton variant="secondary">Add area</SubmitButton>
            </ActionForm>
          </Card>
          <Card title={`Contractors (${contractors.length})`}>
            <table className="table">
              <thead><tr><th>Name</th><th>Scope</th><th className="num">Members</th></tr></thead>
              <tbody>{contractors.map((c) => <tr key={c.id}><td className="font-medium">{c.name}</td><td className="text-xs text-ink-2">{c.scope}</td><td className="num">{c._count.members}</td></tr>)}</tbody>
            </table>
            <ActionForm action={saveContractor} resetOnSuccess className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="Name"><input className="input w-48" name="name" required /></Field>
              <Field label="Scope" className="flex-1"><input className="input" name="scope" /></Field>
              <SubmitButton variant="secondary">Add contractor</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      )}

      <Card title="Create new project">
        <ActionForm action={saveProject} resetOnSuccess>
          {projectFields()}
          <p className="mt-2 text-xs text-muted">The standard 8-stage weighting is created automatically and can be adjusted afterwards.</p>
          <div className="mt-3"><SubmitButton>Create project</SubmitButton></div>
        </ActionForm>
      </Card>
    </div>
  );
}
