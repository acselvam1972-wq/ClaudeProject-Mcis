import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { can } from "@/lib/rbac";
import { fmtDate, fmtNum, fmtTonnes, todayUtc } from "@/lib/format";
import { Card, Kpi, PageHeader, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { receiveShipment } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const s = await prisma.shipment.findUnique({ where: { id: (await params).id }, select: { number: true } });
  return { title: s ? `Shipment ${s.number}` : "Shipment" };
}

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const project = await requireProject();
  const { id } = await params;
  const s = await prisma.shipment.findFirst({
    where: { id, projectId: project.id },
    include: { items: { orderBy: { member: { markNo: "asc" } }, include: { member: { select: { id: true, markNo: true, memberType: true, profile: true, unitWeightKg: true, area: { select: { code: true } } } } } } },
  });
  if (!s) notFound();
  const kg = s.items.reduce((a, i) => a + i.quantity * i.member.unitWeightKg, 0);
  const canReceive = s.status === "IN_TRANSIT" && can(user.role, "materials.manage");
  const table = (receiving: boolean) => (
    <table className="table">
      <thead><tr><th>Mark</th><th>Area</th><th>Type</th><th>Profile</th><th className="num">Unit kg</th><th className="num">Dispatched</th><th className="num">Received</th><th className="num">Damaged</th></tr></thead>
      <tbody>
        {s.items.map((i) => (
          <tr key={i.id}>
            <td><Link className="text-accent hover:underline" href={`/members/${i.member.id}`}>{i.member.markNo}</Link></td>
            <td>{i.member.area.code}</td>
            <td className="text-xs">{i.member.memberType}</td>
            <td className="text-xs text-ink-2">{i.member.profile}</td>
            <td className="num">{fmtNum(i.member.unitWeightKg, 1)}</td>
            <td className="num">{i.quantity}</td>
            <td className="num">{receiving ? <input className="input w-20 py-1 text-right" type="number" min={0} max={i.quantity} name={`recv_${i.id}`} defaultValue={i.quantity} aria-label={`Received ${i.member.markNo}`} /> : (i.qtyReceived ?? "—")}</td>
            <td className="num">{receiving ? <input className="input w-20 py-1 text-right" type="number" min={0} max={i.quantity} name={`dmg_${i.id}`} defaultValue={0} aria-label={`Damaged ${i.member.markNo}`} /> : <span className={i.damaged ? "font-semibold text-critical-ink" : ""}>{i.damaged}</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <>
      <PageHeader title={`Shipment ${s.number}`} subtitle={<><Link href="/materials" className="hover:underline">Material Tracking</Link> · {s.transporter ?? "—"} · {s.vehicleNo ?? "—"}</>} actions={<StatusBadge value={s.status} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Dispatched" value={fmtDate(s.dispatchDate)} />
        <Kpi label="Received" value={fmtDate(s.receivedDate)} sub={s.laydownArea ? `Laydown ${s.laydownArea}` : undefined} />
        <Kpi label="Marks / pieces" value={`${s.items.length} / ${s.items.reduce((a, i) => a + i.quantity, 0)}`} />
        <Kpi label="Tonnage" value={fmtTonnes(kg, 2)} />
      </div>
      <Card className="mt-4" bodyClass="p-0" title="Contents">
        {canReceive ? (
          <ActionForm action={receiveShipment} className="pb-3">
            <input type="hidden" name="id" value={s.id} />
            <div className="overflow-x-auto">{table(true)}</div>
            <div className="flex flex-wrap items-end gap-3 border-t border-line px-3 pt-3">
              <label className="block"><span className="label">Received date *</span><input className="input" type="date" name="receivedDate" defaultValue={fmtDate(todayUtc())} max={fmtDate(todayUtc())} min={fmtDate(s.dispatchDate)} required /></label>
              <label className="block"><span className="label">Laydown area</span><input className="input" name="laydownArea" placeholder="LD-PR-01" /></label>
              <SubmitButton>Confirm receipt</SubmitButton>
            </div>
            <p className="px-3 pt-2 text-xs text-muted">Good pieces (received − damaged) are booked to the RECEIPT stage. Damaged pieces raise an NCR automatically.</p>
          </ActionForm>
        ) : (
          <div className="overflow-x-auto">{table(false)}</div>
        )}
      </Card>
      {s.remarks && <Card className="mt-4" title="Remarks"><p className="text-sm">{s.remarks}</p></Card>}
    </>
  );
}
