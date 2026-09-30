import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCurrentProject } from "@/lib/project";
import { areaProgress, contractorProgress, dailyEarned, sCurve, stageTonnage } from "@/lib/queries";
import { fmtDate, fmtPct, fmtTonnes, todayUtc } from "@/lib/format";
import { spi } from "@/lib/progress";
import { Card, Empty, Kpi, PageHeader, ProgressBar, StatusBadge } from "@/components/ui";
import { DailyChart, SCurveChart, StageChart } from "@/components/charts";
import { AreaContractorFilter } from "./filters";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ area?: string; contractor?: string }> }) {
  await requireUser();
  const project = await getCurrentProject();
  if (!project) {
    return (
      <Card>
        <Empty>
          No project exists yet. <Link className="text-accent underline" href="/admin">Create one in Administration</Link>.
        </Empty>
      </Card>
    );
  }
  const { area, contractor } = await searchParams;
  const pid = project.id;
  const [curve, stages, areas, contractors, daily, openNcr, openPunch, pendingQc, failedInsp, recent] = await Promise.all([
    sCurve(pid, area, contractor),
    stageTonnage(pid, area, contractor),
    areaProgress(pid, contractor),
    contractorProgress(pid),
    dailyEarned(pid, 30),
    prisma.ncr.groupBy({ by: ["severity"], where: { projectId: pid, status: { not: "CLOSED" } }, _count: true }),
    prisma.punchItem.count({ where: { projectId: pid, status: "OPEN" } }),
    prisma.progressEntry.count({ where: { status: "PENDING_QC", member: { projectId: pid } } }),
    prisma.inspection.count({ where: { projectId: pid, result: "FAILED" } }),
    prisma.progressEntry.findMany({
      where: { member: { projectId: pid } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { member: { select: { markNo: true, id: true } }, stage: { select: { code: true } }, enteredBy: { select: { name: true } } },
    }),
  ]);

  const { totals, actualToday, plannedToday } = curve;
  const index = plannedToday ? spi(actualToday, plannedToday) : null;
  const variance = plannedToday != null ? actualToday - plannedToday : null;
  const erect = stages.find((s) => s.code === "ERECT");
  const received = stages.find((s) => s.code === "RECEIPT");
  const last7 = daily.slice(-7).reduce((s, d) => s + d.erectedT, 0);
  const ncrTotal = openNcr.reduce((s, x) => s + x._count, 0);
  const ncrCritical = openNcr.find((x) => x.severity === "CRITICAL")?._count ?? 0;
  const today = fmtDate(todayUtc());
  const scopeLabel = [area && areas.find((a) => a.id === area)?.code, contractor && contractors.find((c) => c.id === contractor)?.name].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={<>{project.code} · {fmtDate(project.startDate)} → {fmtDate(project.endDate)}{scopeLabel && <> · Filtered: <b>{scopeLabel}</b></>}</>}
        actions={<AreaContractorFilter projectId={pid} area={area} contractor={contractor} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Overall progress (weighted)"
          value={fmtPct(actualToday)}
          sub={variance != null ? `${variance >= 0 ? "▲" : "▼"} ${Math.abs(variance).toFixed(1)} pts vs plan ${fmtPct(plannedToday!)}` : "No baseline"}
          tone={variance == null ? "neutral" : variance >= 0 ? "good" : "bad"}
        />
        <Kpi label="Schedule performance (SPI)" value={index ? index.toFixed(2) : "—"} sub={index ? (index >= 1 ? "On / ahead of schedule" : index >= 0.95 ? "Slightly behind" : "Behind schedule") : "Needs baseline"} tone={!index ? "neutral" : index >= 0.95 ? "good" : "bad"} />
        <Kpi label="Total scope" value={fmtTonnes(totals.totalKg)} sub={`${totals.marks.toLocaleString()} marks · ${totals.pieces.toLocaleString()} pcs`} />
        <Kpi label="Erected" value={fmtTonnes(erect?.doneKg ?? 0)} sub={`${fmtPct(totals.totalKg ? ((erect?.doneKg ?? 0) / totals.totalKg) * 100 : 0)} · ${last7.toFixed(1)} t last 7 days`} />
        <Kpi label="Received at site" value={fmtTonnes(received?.doneKg ?? 0)} sub={`${fmtTonnes(Math.max(0, (received?.doneKg ?? 0) - (erect?.doneKg ?? 0)))} in laydown`} />
        <Kpi
          label="Awaiting QC approval"
          value={<Link href="/qc" className="hover:underline">{pendingQc.toLocaleString()}</Link>}
          sub={`${ncrTotal} open NCRs (${ncrCritical} critical) · ${openPunch} punch · ${failedInsp} failed insp.`}
          tone={ncrCritical > 0 ? "bad" : "neutral"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card title="Progress S-curve — planned vs actual (cumulative %)" className="xl:col-span-3">
          <SCurveChart data={curve.points} today={today} />
        </Card>
        <Card title="Stage completion by tonnage" className="xl:col-span-2">
          <StageChart
            data={stages.map((s) => ({
              code: s.code,
              name: `${s.name} (weight ${s.weight}%)`,
              donePct: s.totalKg ? (s.doneKg / s.totalKg) * 100 : 0,
              pendingPct: s.totalKg ? (s.pendingKg / s.totalKg) * 100 : 0,
            }))}
          />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card title="Progress by area" className="xl:col-span-3" bodyClass="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Area</th>
                <th className="num">Scope</th>
                <th className="num">Erected</th>
                <th className="w-1/3">Progress <span className="font-normal normal-case text-muted">(| = plan today)</span></th>
                <th className="num">Actual</th>
                <th className="num">Plan</th>
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/?area=${a.id}`} className="font-medium hover:underline">{a.code}</Link>
                    <div className="text-xs text-muted">{a.name}</div>
                  </td>
                  <td className="num">{fmtTonnes(a.totalKg)}</td>
                  <td className="num">{fmtTonnes(a.erectedKg)}</td>
                  <td><ProgressBar value={a.pct} planned={a.plannedPct} /></td>
                  <td className="num font-medium">{fmtPct(a.pct)}</td>
                  <td className={`num ${a.plannedPct != null && a.pct < a.plannedPct - 2 ? "text-critical-ink" : "text-ink-2"}`}>{a.plannedPct != null ? fmtPct(a.plannedPct) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Progress by contractor" className="xl:col-span-2" bodyClass="overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Contractor</th><th className="num">Scope</th><th className="w-2/5">Progress</th><th className="num">%</th></tr>
            </thead>
            <tbody>
              {contractors.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/?contractor=${c.id}`} className="hover:underline">{c.name}</Link></td>
                  <td className="num">{fmtTonnes(c.totalKg)}</td>
                  <td><ProgressBar value={c.pct} /></td>
                  <td className="num font-medium">{fmtPct(c.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card title="Daily output — last 30 days" className="xl:col-span-3">
          <DailyChart data={daily} />
        </Card>
        <Card title="Recent activity" className="xl:col-span-2" bodyClass="overflow-x-auto">
          {recent.length === 0 ? (
            <Empty>No progress recorded yet.</Empty>
          ) : (
            <table className="table">
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id}>
                    <td className="text-xs text-muted tabular">{fmtDate(e.workDate)}</td>
                    <td><Link href={`/members/${e.member.id}`} className="font-medium hover:underline">{e.member.markNo}</Link></td>
                    <td className="text-xs">{e.stage.code} × {e.quantity}</td>
                    <td><StatusBadge value={e.status} /></td>
                    <td className="hidden text-xs text-ink-2 2xl:table-cell">{e.enteredBy.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
