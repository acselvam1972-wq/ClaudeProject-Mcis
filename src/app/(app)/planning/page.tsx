import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { can } from "@/lib/rbac";
import { sCurve } from "@/lib/queries";
import { fmtDate, fmtPct, todayUtc } from "@/lib/format";
import { Card, Empty, Kpi, PageHeader } from "@/components/ui";
import { SCurveChart } from "@/components/charts";
import { ActionForm, SubmitButton } from "@/components/form";
import { generateBaseline, uploadBaseline } from "./actions";

export const metadata = { title: "Planning & S-Curve" };

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const user = await requireUser();
  const project = await requireProject();
  const { area } = await searchParams;
  const areas = await prisma.area.findMany({ where: { projectId: project.id }, orderBy: { code: "asc" } });
  const selected = areas.find((a) => a.id === area);
  const curve = await sCurve(project.id, selected?.id ?? null);
  const today = fmtDate(todayUtc());

  // Weekly table: planned vs actual at each baseline point, plus period deltas.
  const planned = curve.points.filter((p) => p.planned !== undefined);
  const weekly = planned.map((p, i) => ({
    ...p,
    periodPlan: i ? p.planned! - planned[i - 1].planned! : p.planned!,
    periodActual: p.actual !== undefined && i && planned[i - 1].actual !== undefined ? p.actual - planned[i - 1].actual! : undefined,
  }));
  const currentWeek = weekly.filter((w) => w.date <= today).at(-1)?.date;
  const variance = curve.plannedToday != null ? curve.actualToday - curve.plannedToday : null;
  const editable = can(user.role, "plan.edit");
  const defaultStart = fmtDate(project.startDate);
  const defaultEnd = fmtDate(project.endDate);

  return (
    <>
      <PageHeader
        title="Planning & S-Curve"
        subtitle="Baseline (planned cumulative %) against earned progress."
        actions={
          <form method="get" className="flex gap-2">
            <select name="area" defaultValue={area ?? ""} className="input w-auto" aria-label="Scope">
              <option value="">Whole project</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
            <button className="btn btn-secondary">Show</button>
          </form>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Planned to date" value={curve.plannedToday != null ? fmtPct(curve.plannedToday) : "—"} />
        <Kpi label="Actual to date" value={fmtPct(curve.actualToday)} />
        <Kpi label="Variance" value={variance != null ? `${variance >= 0 ? "+" : ""}${variance.toFixed(1)} pts` : "—"} tone={variance == null ? "neutral" : variance >= 0 ? "good" : "bad"} sub={variance == null ? "" : variance >= 0 ? "Ahead of baseline" : "Behind baseline"} />
        <Kpi label="Baseline points" value={planned.length} sub={selected ? selected.code : "Project level"} />
      </div>
      <Card title={`S-curve — ${selected ? `${selected.code} ${selected.name}` : "whole project"}`} className="mt-4">
        <SCurveChart data={curve.points} today={today} />
      </Card>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Baseline table" className="xl:col-span-2" bodyClass="max-h-[28rem] overflow-auto">
          {weekly.length === 0 ? <Empty>No baseline yet for this scope.</Empty> : (
            <table className="table">
              <thead><tr><th>Date</th><th className="num">Planned cum.</th><th className="num">Actual cum.</th><th className="num">Variance</th><th className="num">Period plan</th><th className="num">Period actual</th></tr></thead>
              <tbody>
                {weekly.map((w) => {
                  const v = w.actual !== undefined ? w.actual - w.planned! : undefined;
                  return (
                    <tr key={w.date} className={w.date === currentWeek ? "bg-accent-soft font-medium" : ""}>
                      <td className="tabular">{w.date}</td>
                      <td className="num">{fmtPct(w.planned!)}</td>
                      <td className="num">{w.actual !== undefined ? fmtPct(w.actual) : "—"}</td>
                      <td className={`num ${v !== undefined && v < 0 ? "text-critical-ink" : "text-good-ink"}`}>{v !== undefined ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}` : "—"}</td>
                      <td className="num">{w.periodPlan.toFixed(2)}</td>
                      <td className="num">{w.periodActual !== undefined ? w.periodActual.toFixed(2) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
        {editable ? (
          <div className="space-y-4">
            <Card title="Generate baseline">
              <ActionForm action={generateBaseline} confirm="Replace the existing baseline for this scope?">
                <input type="hidden" name="areaId" value={selected?.id ?? ""} />
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="label">Start</span><input className="input" type="date" name="start" defaultValue={defaultStart} required /></label>
                  <label className="block"><span className="label">Finish</span><input className="input" type="date" name="end" defaultValue={defaultEnd} required /></label>
                  <label className="block"><span className="label">Interval (days)</span><input className="input" type="number" name="interval" min={1} max={31} defaultValue={7} /></label>
                  <label className="block"><span className="label">Steepness (2–20)</span><input className="input" type="number" name="steepness" min={2} max={20} step="0.5" defaultValue={10} /></label>
                </div>
                <p className="mt-2 text-xs text-muted">Logistic S-curve. Higher steepness concentrates work mid-schedule. Applies to: <b>{selected?.code ?? "whole project"}</b>.</p>
                <div className="mt-3"><SubmitButton>Generate & replace</SubmitButton></div>
              </ActionForm>
            </Card>
            <Card title="Upload baseline (CSV)">
              <ActionForm action={uploadBaseline} confirm="Replace the existing baseline for this scope?">
                <input type="hidden" name="areaId" value={selected?.id ?? ""} />
                <input className="input" type="file" name="file" accept=".csv,.txt" required />
                <p className="mt-2 text-xs text-muted">Two columns: <code>date,planned_percent</code> (YYYY-MM-DD, cumulative 0–100). Export from Primavera P6 / MS Project.</p>
                <div className="mt-3"><SubmitButton>Upload & replace</SubmitButton></div>
              </ActionForm>
            </Card>
          </div>
        ) : (
          <Card title="Baseline"><p className="text-sm text-ink-2">Only planners and project managers can change the baseline.</p></Card>
        )}
      </div>
    </>
  );
}
