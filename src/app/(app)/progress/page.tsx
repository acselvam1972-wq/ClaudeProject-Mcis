import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { can } from "@/lib/rbac";
import { fmtDate, fmtDateTime, fmtNum, parseDay, todayUtc } from "@/lib/format";
import { Card, Empty, PageHeader, Pagination, StatusBadge, Tabs } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { BulkTable, type EligibleRow } from "./bulk-table";
import { bookBulk } from "./actions";

export const metadata = { title: "Daily Progress" };

type SP = { tab?: string; area?: string; stage?: string; date?: string; q?: string; status?: string; from?: string; to?: string; user?: string; page?: string };

export default async function ProgressPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const project = await requireProject();
  const sp = await searchParams;
  const canEnter = can(user.role, "progress.enter");
  const tab = sp.tab === "log" || !canEnter ? "log" : "entry";
  return (
    <>
      <PageHeader title="Daily Progress" subtitle="Book site and shop progress by stage; review the progress log." />
      <Tabs
        active={tab === "entry" ? "/progress" : "/progress?tab=log"}
        tabs={[...(canEnter ? [{ href: "/progress", label: "Bulk entry" }] : []), { href: "/progress?tab=log", label: "Progress log" }]}
      />
      {tab === "entry" ? <EntryTab projectId={project.id} sp={sp} /> : <LogTab projectId={project.id} sp={sp} />}
    </>
  );
}

async function EntryTab({ projectId, sp }: { projectId: string; sp: SP }) {
  const [areas, stages] = await Promise.all([
    prisma.area.findMany({ where: { projectId }, orderBy: { code: "asc" } }),
    prisma.stage.findMany({ where: { projectId }, orderBy: { sequence: "asc" } }),
  ]);
  const today = fmtDate(todayUtc());
  const stage = stages.find((s) => s.id === sp.stage);
  const area = areas.find((a) => a.id === sp.area);
  let rows: EligibleRow[] = [];
  if (stage && area) {
    const prev = stages.filter((s) => s.sequence < stage.sequence).at(-1);
    // Available = (prev stage approved, or member qty for the first stage) − (approved + pending here)
    rows = await prisma.$queryRaw<EligibleRow[]>`
      SELECT m.id, m."markNo", m."memberType", m.profile, m.quantity, m."unitWeightKg", x.booked::int, x.available::int FROM (
        SELECT m.id,
          COALESCE(here."qtyDone", 0) + COALESCE(p.q, 0) AS booked,
          ${prev ? Prisma.sql`COALESCE(prev."qtyDone", 0)` : Prisma.sql`m.quantity`} - COALESCE(here."qtyDone", 0) - COALESCE(p.q, 0) AS available
        FROM "Member" m
        LEFT JOIN "MemberStage" here ON here."memberId" = m.id AND here."stageId" = ${stage.id}
        LEFT JOIN "MemberStage" prev ON prev."memberId" = m.id AND prev."stageId" = ${prev?.id ?? ""}
        LEFT JOIN (SELECT "memberId", SUM(quantity) q FROM "ProgressEntry" WHERE "stageId" = ${stage.id} AND status = 'PENDING_QC' GROUP BY 1) p ON p."memberId" = m.id
        WHERE m."projectId" = ${projectId} AND m."areaId" = ${area.id}
      ) x JOIN "Member" m ON m.id = x.id
      WHERE x.available > 0 ${sp.q ? Prisma.sql`AND m."markNo" ILIKE ${`%${sp.q}%`}` : Prisma.empty}
      ORDER BY m."markNo" LIMIT 500`;
  }
  return (
    <>
      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block"><span className="label">Area</span>
            <select className="input w-auto" name="area" defaultValue={sp.area ?? ""} required>
              <option value="" disabled>Select area…</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Stage</span>
            <select className="input w-auto" name="stage" defaultValue={sp.stage ?? ""} required>
              <option value="" disabled>Select stage…</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.sequence}. {s.name}{s.qcHold ? " (QC hold)" : ""}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Mark filter</span><input className="input w-40" name="q" defaultValue={sp.q} placeholder="e.g. CO0" /></label>
          <button className="btn btn-secondary">Load members</button>
        </form>
      </Card>
      {stage && area && (
        <Card
          className="mt-4"
          title={<>Eligible for <b>{stage.name}</b> in {area.code} — {rows.length}{rows.length === 500 ? "+" : ""} marks</>}
          bodyClass="p-0"
        >
          {rows.length === 0 ? (
            <Empty>No members are ready for this stage. Members become available when the previous stage is approved.</Empty>
          ) : (
            <ActionForm action={bookBulk} className="pb-3">
              <input type="hidden" name="stageId" value={stage.id} />
              <BulkTable rows={rows} />
              <div className="flex flex-wrap items-end gap-3 border-t border-line px-3 pt-3">
                <label className="block"><span className="label">Work date</span><input className="input" type="date" name="workDate" defaultValue={sp.date ?? today} max={today} required /></label>
                <label className="block flex-1"><span className="label">Remarks (applies to all)</span><input className="input" name="remarks" placeholder="Crew, crane, shift…" /></label>
                <SubmitButton>Submit progress</SubmitButton>
              </div>
              {stage.qcHold && <p className="px-3 pt-2 text-xs text-muted">This is a QC-hold stage: entries are sent to the QC queue and earn progress once approved.</p>}
            </ActionForm>
          )}
        </Card>
      )}
    </>
  );
}

const LOG_PAGE = 50;

async function LogTab({ projectId, sp }: { projectId: string; sp: SP }) {
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.ProgressEntryWhereInput = { member: { projectId, ...(sp.area ? { areaId: sp.area } : {}), ...(sp.q ? { markNo: { contains: sp.q, mode: "insensitive" } } : {}) } };
  if (sp.stage) where.stageId = sp.stage;
  if (sp.status) where.status = sp.status as Prisma.ProgressEntryWhereInput["status"];
  if (sp.user) where.enteredById = sp.user;
  const range: Prisma.DateTimeFilter = {};
  try {
    if (sp.from) range.gte = parseDay(sp.from);
    if (sp.to) range.lte = parseDay(sp.to);
  } catch {}
  if (range.gte || range.lte) where.workDate = range;

  const [areas, stages, users, total, entries] = await Promise.all([
    prisma.area.findMany({ where: { projectId }, orderBy: { code: "asc" } }),
    prisma.stage.findMany({ where: { projectId }, orderBy: { sequence: "asc" } }),
    prisma.user.findMany({ where: { progressEntries: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.progressEntry.count({ where }),
    prisma.progressEntry.findMany({
      where,
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * LOG_PAGE,
      take: LOG_PAGE,
      include: { member: { select: { id: true, markNo: true, unitWeightKg: true, area: { select: { code: true } } } }, stage: true, enteredBy: { select: { name: true } } },
    }),
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page" && k !== "tab") as [string, string][]).toString();
  return (
    <Card bodyClass="p-0" actions={<a className="btn btn-secondary btn-sm" href={`/api/export/progress-log?${qs}`}>Export Excel</a>} title="Progress log">
      <form method="get" className="flex flex-wrap items-end gap-2 border-b border-line p-3">
        <input type="hidden" name="tab" value="log" />
        <input className="input w-36" name="q" placeholder="Mark no." defaultValue={sp.q} />
        <select className="input w-auto" name="area" defaultValue={sp.area ?? ""} aria-label="Area"><option value="">All areas</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}</select>
        <select className="input w-auto" name="stage" defaultValue={sp.stage ?? ""} aria-label="Stage"><option value="">All stages</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}</select>
        <select className="input w-auto" name="status" defaultValue={sp.status ?? ""} aria-label="Status"><option value="">Any status</option><option>APPROVED</option><option>PENDING_QC</option><option>REJECTED</option></select>
        <select className="input w-auto" name="user" defaultValue={sp.user ?? ""} aria-label="Entered by"><option value="">Anyone</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <label className="text-xs text-ink-2">From <input className="input w-auto" type="date" name="from" defaultValue={sp.from} /></label>
        <label className="text-xs text-ink-2">To <input className="input w-auto" type="date" name="to" defaultValue={sp.to} /></label>
        <button className="btn btn-secondary">Filter</button>
      </form>
      <div className="overflow-x-auto">
        {entries.length === 0 ? <Empty>No entries.</Empty> : (
          <table className="table">
            <thead><tr><th>Work date</th><th>Mark</th><th>Area</th><th>Stage</th><th className="num">Qty</th><th className="num">Earned kg</th><th>Status</th><th>Entered by</th><th>Remarks</th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="tabular">{fmtDate(e.workDate)}</td>
                  <td><Link className="text-accent hover:underline" href={`/members/${e.member.id}`}>{e.member.markNo}</Link></td>
                  <td>{e.member.area.code}</td>
                  <td>{e.stage.code}</td>
                  <td className="num">{e.quantity}</td>
                  <td className="num">{fmtNum((e.quantity * e.member.unitWeightKg * e.stage.weight) / 100, 1)}</td>
                  <td><StatusBadge value={e.status} /></td>
                  <td className="text-xs">{e.enteredBy.name}<div className="text-muted">{fmtDateTime(e.createdAt)}</div></td>
                  <td className="max-w-64 truncate text-xs text-ink-2">{[e.remarks, e.reviewNote && `QC: ${e.reviewNote}`].filter(Boolean).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pageSize={LOG_PAGE} total={total} params={{ ...sp, page: undefined, tab: "log" }} />
    </Card>
  );
}
