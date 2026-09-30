import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { can } from "@/lib/rbac";
import { fmtDate, fmtTonnes } from "@/lib/format";
import { Card, Empty, PageHeader, Pagination, StatusBadge, Tabs } from "@/components/ui";

export const metadata = { title: "Material Tracking" };
const PAGE = 40;

type SP = { tab?: string; status?: string; area?: string; page?: string };

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const project = await requireProject();
  const sp = await searchParams;
  const tab = sp.tab === "status" ? "status" : "shipments";
  return (
    <>
      <PageHeader
        title="Material Tracking"
        subtitle="Shop dispatch, site receipt, laydown and shortages."
        actions={can(user.role, "materials.manage") && <Link className="btn btn-primary" href="/materials/new">New dispatch</Link>}
      />
      <Tabs active={tab === "status" ? "/materials?tab=status" : "/materials"} tabs={[{ href: "/materials", label: "Shipments" }, { href: "/materials?tab=status", label: "Material status & shortages" }]} />
      {tab === "shipments" ? <Shipments projectId={project.id} sp={sp} /> : <StatusTab projectId={project.id} sp={sp} />}
    </>
  );
}

async function Shipments({ projectId, sp }: { projectId: string; sp: SP }) {
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.ShipmentWhereInput = { projectId };
  if (sp.status === "IN_TRANSIT" || sp.status === "RECEIVED") where.status = sp.status;
  const [total, shipments] = await Promise.all([
    prisma.shipment.count({ where }),
    prisma.shipment.findMany({ where, orderBy: [{ dispatchDate: "desc" }, { number: "desc" }], skip: (page - 1) * PAGE, take: PAGE, include: { items: { include: { member: { select: { unitWeightKg: true } } } } } }),
  ]);
  return (
    <Card bodyClass="p-0" title={`Shipments (${total})`}
      actions={
        <form method="get" className="flex gap-2">
          <select className="input w-auto py-1" name="status" defaultValue={sp.status ?? ""} aria-label="Status"><option value="">All</option><option value="IN_TRANSIT">In transit</option><option value="RECEIVED">Received</option></select>
          <button className="btn btn-secondary btn-sm">Filter</button>
        </form>
      }>
      <div className="overflow-x-auto">
        {shipments.length === 0 ? <Empty>No shipments.</Empty> : (
          <table className="table">
            <thead><tr><th>Delivery note</th><th>Dispatched</th><th>Received</th><th>Vehicle</th><th>Transporter</th><th className="num">Marks</th><th className="num">Pcs</th><th className="num">Tonnage</th><th>Laydown</th><th>Status</th></tr></thead>
            <tbody>
              {shipments.map((s) => {
                const kg = s.items.reduce((a, i) => a + i.quantity * i.member.unitWeightKg, 0);
                const dmg = s.items.reduce((a, i) => a + i.damaged, 0);
                return (
                  <tr key={s.id}>
                    <td><Link className="font-medium text-accent hover:underline" href={`/materials/${s.id}`}>{s.number}</Link></td>
                    <td className="tabular">{fmtDate(s.dispatchDate)}</td>
                    <td className="tabular">{fmtDate(s.receivedDate)}</td>
                    <td className="text-xs">{s.vehicleNo}</td>
                    <td className="text-xs">{s.transporter}</td>
                    <td className="num">{s.items.length}</td>
                    <td className="num">{s.items.reduce((a, i) => a + i.quantity, 0)}{dmg ? <span className="text-critical-ink"> ({dmg} dmg)</span> : ""}</td>
                    <td className="num">{fmtTonnes(kg, 2)}</td>
                    <td className="text-xs">{s.laydownArea ?? "—"}</td>
                    <td><StatusBadge value={s.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pageSize={PAGE} total={total} params={{ ...sp, page: undefined }} />
    </Card>
  );
}

async function StatusTab({ projectId, sp }: { projectId: string; sp: SP }) {
  const codes = ["FAB", "DISPATCH", "RECEIPT", "ERECT"];
  const stages = await prisma.stage.findMany({ where: { projectId, code: { in: codes } } });
  const id = (c: string) => stages.find((s) => s.code === c)?.id ?? "";
  if (stages.length < codes.length) return <Card><Empty>Material status needs FAB, DISPATCH, RECEIPT and ERECT stages configured.</Empty></Card>;

  const rows = await prisma.$queryRaw<{ id: string; code: string; name: string; total: number; fab: number; disp: number; recv: number; erect: number }[]>`
    SELECT a.id, a.code, a.name,
      COALESCE(SUM(m.quantity * m."unitWeightKg"), 0)::float AS total,
      COALESCE(SUM(COALESCE(f."qtyDone", 0) * m."unitWeightKg"), 0)::float AS fab,
      COALESCE(SUM(COALESCE(d."qtyDone", 0) * m."unitWeightKg"), 0)::float AS disp,
      COALESCE(SUM(COALESCE(r."qtyDone", 0) * m."unitWeightKg"), 0)::float AS recv,
      COALESCE(SUM(COALESCE(e."qtyDone", 0) * m."unitWeightKg"), 0)::float AS erect
    FROM "Area" a
    LEFT JOIN "Member" m ON m."areaId" = a.id
    LEFT JOIN "MemberStage" f ON f."memberId" = m.id AND f."stageId" = ${id("FAB")}
    LEFT JOIN "MemberStage" d ON d."memberId" = m.id AND d."stageId" = ${id("DISPATCH")}
    LEFT JOIN "MemberStage" r ON r."memberId" = m.id AND r."stageId" = ${id("RECEIPT")}
    LEFT JOIN "MemberStage" e ON e."memberId" = m.id AND e."stageId" = ${id("ERECT")}
    WHERE a."projectId" = ${projectId}
    GROUP BY a.id ORDER BY a.code`;

  const areaId = sp.area ?? rows[0]?.id;
  // Shortages: primary members not yet received, in areas where erection has begun.
  const shortages = areaId
    ? await prisma.$queryRaw<{ id: string; markNo: string; memberType: string; drawingNo: string | null; quantity: number; unitWeightKg: number; fab: number; disp: number; recv: number }[]>`
      SELECT m.id, m."markNo", m."memberType", m."drawingNo", m.quantity, m."unitWeightKg",
        COALESCE(f."qtyDone", 0)::int AS fab, COALESCE(d."qtyDone", 0)::int AS disp, COALESCE(r."qtyDone", 0)::int AS recv
      FROM "Member" m
      LEFT JOIN "MemberStage" f ON f."memberId" = m.id AND f."stageId" = ${id("FAB")}
      LEFT JOIN "MemberStage" d ON d."memberId" = m.id AND d."stageId" = ${id("DISPATCH")}
      LEFT JOIN "MemberStage" r ON r."memberId" = m.id AND r."stageId" = ${id("RECEIPT")}
      WHERE m."areaId" = ${areaId} AND COALESCE(r."qtyDone", 0) < m.quantity
      ORDER BY CASE m."memberType" WHEN 'BASE PLATE' THEN 0 WHEN 'COLUMN' THEN 1 WHEN 'BEAM' THEN 2 WHEN 'BRACING' THEN 3 ELSE 9 END, m."markNo"
      LIMIT 300`
    : [];
  const bucket = (kg: number, total: number) => (
    <td className="num">{fmtTonnes(kg, 1)}<div className="text-xs text-muted">{total ? ((kg / total) * 100).toFixed(0) : 0}%</div></td>
  );
  const status = (s: { quantity: number; fab: number; disp: number; recv: number }) =>
    s.disp > s.recv ? "IN_TRANSIT" : s.fab > s.disp ? "AT SHOP (NOT DISPATCHED)" : "NOT FABRICATED";

  return (
    <div className="space-y-4">
      <Card title="Material pipeline by area (tonnage)" bodyClass="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Area</th><th className="num">Scope</th><th className="num">Not fabricated</th><th className="num">At shop</th><th className="num">In transit</th><th className="num">Site laydown</th><th className="num">Erected</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.id === areaId ? "bg-accent-soft" : ""}>
                <td><Link className="font-medium hover:underline" href={`/materials?tab=status&area=${r.id}`}>{r.code}</Link><div className="text-xs text-muted">{r.name}</div></td>
                <td className="num">{fmtTonnes(r.total)}</td>
                {bucket(r.total - r.fab, r.total)}
                {bucket(r.fab - r.disp, r.total)}
                {bucket(r.disp - r.recv, r.total)}
                {bucket(r.recv - r.erect, r.total)}
                {bucket(r.erect, r.total)}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title={`Not yet at site — ${rows.find((r) => r.id === areaId)?.code ?? ""} (${shortages.length}${shortages.length === 300 ? "+" : ""})`} bodyClass="max-h-[32rem] overflow-auto"
        actions={areaId && <a className="btn btn-secondary btn-sm" href={`/api/export/shortages?area=${areaId}`}>Export Excel</a>}>
        {shortages.length === 0 ? <Empty>Everything for this area is on site. ✓</Empty> : (
          <table className="table">
            <thead><tr><th>Mark</th><th>Type</th><th>Drawing</th><th className="num">Qty</th><th className="num">Received</th><th className="num">Short (t)</th><th>Where is it?</th></tr></thead>
            <tbody>
              {shortages.map((s) => (
                <tr key={s.id}>
                  <td><Link className="text-accent hover:underline" href={`/members/${s.id}`}>{s.markNo}</Link></td>
                  <td className="text-xs">{s.memberType}</td>
                  <td className="text-xs text-ink-2">{s.drawingNo}</td>
                  <td className="num">{s.quantity}</td>
                  <td className="num">{s.recv}</td>
                  <td className="num">{(((s.quantity - s.recv) * s.unitWeightKg) / 1000).toFixed(3)}</td>
                  <td><StatusBadge value={status(s)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
