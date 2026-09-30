import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { can } from "@/lib/rbac";
import { fmtDate, todayUtc } from "@/lib/format";
import { Card, Empty, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { BulkTable, type EligibleRow } from "../../progress/bulk-table";
import { createShipment } from "../actions";

export const metadata = { title: "New dispatch" };

export default async function NewShipment({ searchParams }: { searchParams: Promise<{ area?: string; q?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "materials.manage")) redirect("/materials");
  const project = await requireProject();
  const sp = await searchParams;
  const [areas, stages, count] = await Promise.all([
    prisma.area.findMany({ where: { projectId: project.id }, orderBy: { code: "asc" } }),
    prisma.stage.findMany({ where: { projectId: project.id }, orderBy: { sequence: "asc" } }),
    prisma.shipment.count({ where: { projectId: project.id } }),
  ]);
  const dispatch = stages.find((s) => s.code === "DISPATCH");
  const prev = dispatch ? stages.filter((s) => s.sequence < dispatch.sequence).at(-1) : undefined;
  const area = areas.find((a) => a.id === sp.area);
  let rows: EligibleRow[] = [];
  if (dispatch && area) {
    rows = await prisma.$queryRaw<EligibleRow[]>`
      SELECT m.id, m."markNo", m."memberType", m.profile, m.quantity, m."unitWeightKg",
        COALESCE(here."qtyDone", 0)::int AS booked,
        (${prev ? Prisma.sql`COALESCE(prev."qtyDone", 0)` : Prisma.sql`m.quantity`} - COALESCE(here."qtyDone", 0))::int AS available
      FROM "Member" m
      LEFT JOIN "MemberStage" here ON here."memberId" = m.id AND here."stageId" = ${dispatch.id}
      LEFT JOIN "MemberStage" prev ON prev."memberId" = m.id AND prev."stageId" = ${prev?.id ?? ""}
      WHERE m."areaId" = ${area.id}
        AND ${prev ? Prisma.sql`COALESCE(prev."qtyDone", 0)` : Prisma.sql`m.quantity`} - COALESCE(here."qtyDone", 0) > 0
        ${sp.q ? Prisma.sql`AND m."markNo" ILIKE ${`%${sp.q}%`}` : Prisma.empty}
      ORDER BY m."markNo" LIMIT 500`;
  }
  const today = fmtDate(todayUtc());
  return (
    <>
      <PageHeader title="New dispatch" subtitle={`Members become available once ${prev?.name ?? "the previous stage"} is approved.`} />
      {!dispatch ? <Card><Empty>No DISPATCH stage configured.</Empty></Card> : (
        <>
          <Card>
            <form method="get" className="flex flex-wrap items-end gap-3">
              <label className="block"><span className="label">Area</span>
                <select className="input w-auto" name="area" defaultValue={sp.area ?? ""} required>
                  <option value="" disabled>Select area…</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
              </label>
              <label className="block"><span className="label">Mark filter</span><input className="input w-40" name="q" defaultValue={sp.q} /></label>
              <button className="btn btn-secondary">Load ready members</button>
            </form>
          </Card>
          {area && (
            <Card className="mt-4" bodyClass="p-0" title={`Ready for dispatch — ${area.code} (${rows.length})`}>
              {rows.length === 0 ? <Empty>Nothing ready for dispatch in this area.</Empty> : (
                <ActionForm action={createShipment} className="pb-3">
                  <div className="grid grid-cols-2 gap-3 border-b border-line p-3 md:grid-cols-5">
                    <label className="block"><span className="label">Delivery note no. *</span><input className="input" name="number" required defaultValue={`DN-${String(count + 1).padStart(4, "0")}`} /></label>
                    <label className="block"><span className="label">Dispatch date *</span><input className="input" type="date" name="dispatchDate" defaultValue={today} max={today} required /></label>
                    <label className="block"><span className="label">Vehicle no.</span><input className="input" name="vehicleNo" /></label>
                    <label className="block"><span className="label">Transporter</span><input className="input" name="transporter" /></label>
                    <label className="block"><span className="label">Remarks</span><input className="input" name="remarks" /></label>
                  </div>
                  <BulkTable rows={rows} />
                  <div className="border-t border-line px-3 pt-3"><SubmitButton>Create shipment & book dispatch</SubmitButton></div>
                </ActionForm>
              )}
            </Card>
          )}
        </>
      )}
    </>
  );
}
