import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { can } from "@/lib/rbac";
import { currentStageCode, memberPercent } from "@/lib/progress";
import { fmtNum, fmtTonnes } from "@/lib/format";
import { Card, Empty, PageHeader, Pagination, ProgressBar } from "@/components/ui";
import { MemberForm } from "./member-form";

export const metadata = { title: "Member Register" };
const PAGE_SIZE = 50;

type SP = { q?: string; area?: string; type?: string; contractor?: string; stage?: string; reached?: string; page?: string };

export default async function MembersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const project = await requireProject();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.MemberWhereInput = { projectId: project.id };
  if (sp.q) {
    where.OR = [
      { markNo: { contains: sp.q, mode: "insensitive" } },
      { drawingNo: { contains: sp.q, mode: "insensitive" } },
      { profile: { contains: sp.q, mode: "insensitive" } },
    ];
  }
  if (sp.area) where.areaId = sp.area;
  if (sp.type) where.memberType = sp.type;
  if (sp.contractor) where.contractorId = sp.contractor;
  if (sp.stage) {
    where.stages = sp.reached === "no" ? { none: { stageId: sp.stage, qtyDone: { gt: 0 } } } : { some: { stageId: sp.stage, qtyDone: { gt: 0 } } };
  }

  const [areas, contractors, stages, types, total, agg, members] = await Promise.all([
    prisma.area.findMany({ where: { projectId: project.id }, orderBy: { code: "asc" } }),
    prisma.contractor.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } }),
    prisma.stage.findMany({ where: { projectId: project.id }, orderBy: { sequence: "asc" } }),
    prisma.member.findMany({ where: { projectId: project.id }, distinct: ["memberType"], select: { memberType: true }, orderBy: { memberType: "asc" } }),
    prisma.member.count({ where }),
    prisma.member.findMany({ where, select: { quantity: true, unitWeightKg: true } }),
    prisma.member.findMany({
      where,
      orderBy: [{ area: { code: "asc" } }, { markNo: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { area: { select: { code: true } }, contractor: { select: { name: true } }, stages: true },
    }),
  ]);
  const filteredKg = agg.reduce((s, m) => s + m.quantity * m.unitWeightKg, 0);
  const exportQs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Member Register"
        subtitle={`${fmtNum(total)} marks · ${fmtTonnes(filteredKg)} in current filter`}
        actions={
          <>
            <a className="btn btn-secondary" href={`/api/export/members?${exportQs}`}>Export Excel</a>
            {can(user.role, "members.edit") && <Link className="btn btn-primary" href="/members/import">Import MTO</Link>}
          </>
        }
      />
      <Card bodyClass="p-0">
        <form method="get" className="flex flex-wrap items-end gap-2 border-b border-line p-3">
          <input className="input w-56" name="q" placeholder="Search mark, drawing, profile…" defaultValue={sp.q} />
          <select className="input w-auto" name="area" defaultValue={sp.area ?? ""} aria-label="Area">
            <option value="">All areas</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}
          </select>
          <select className="input w-auto" name="type" defaultValue={sp.type ?? ""} aria-label="Member type">
            <option value="">All types</option>
            {types.map((t) => <option key={t.memberType}>{t.memberType}</option>)}
          </select>
          <select className="input w-auto" name="contractor" defaultValue={sp.contractor ?? ""} aria-label="Contractor">
            <option value="">All contractors</option>
            {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input w-auto" name="reached" defaultValue={sp.reached ?? "yes"} aria-label="Stage condition">
            <option value="yes">Has reached</option>
            <option value="no">Not yet at</option>
          </select>
          <select className="input w-auto" name="stage" defaultValue={sp.stage ?? ""} aria-label="Stage">
            <option value="">any stage</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
          </select>
          <button className="btn btn-secondary">Filter</button>
          <Link href="/members" className="btn btn-sm text-ink-2 hover:text-ink">Reset</Link>
        </form>
        <div className="overflow-x-auto">
          {members.length === 0 ? (
            <Empty>No members match the current filter.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Mark no.</th><th>Area</th><th>Type</th><th>Profile</th><th>Drawing</th><th className="num">Qty</th>
                  <th className="num">Unit kg</th><th className="num">Total t</th><th>Current stage</th><th className="w-40">Progress</th><th className="num">%</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const q = new Map(m.stages.map((s) => [s.stageId, s.qtyDone]));
                  const pct = memberPercent(m.quantity, stages, q);
                  return (
                    <tr key={m.id}>
                      <td><Link className="font-medium text-accent hover:underline" href={`/members/${m.id}`}>{m.markNo}</Link></td>
                      <td>{m.area.code}</td>
                      <td className="text-xs">{m.memberType}</td>
                      <td className="text-xs text-ink-2">{m.profile}</td>
                      <td className="text-xs text-ink-2">{m.drawingNo}{m.revision ? ` R${m.revision}` : ""}</td>
                      <td className="num">{m.quantity}</td>
                      <td className="num">{fmtNum(m.unitWeightKg, 1)}</td>
                      <td className="num">{fmtNum((m.quantity * m.unitWeightKg) / 1000, 3)}</td>
                      <td className="text-xs">{currentStageCode(m.quantity, stages, q)}</td>
                      <td><ProgressBar value={pct} /></td>
                      <td className="num">{pct.toFixed(0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} params={{ ...sp, page: undefined }} />
      </Card>
      {can(user.role, "members.edit") && (
        <Card title="Add member manually" className="mt-4">
          <MemberForm areas={areas} contractors={contractors} />
        </Card>
      )}
    </>
  );
}
