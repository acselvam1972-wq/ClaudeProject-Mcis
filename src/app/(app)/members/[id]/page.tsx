import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { can } from "@/lib/rbac";
import { currentStageCode, memberPercent } from "@/lib/progress";
import { fmtDate, fmtDateTime, fmtNum, todayUtc } from "@/lib/format";
import { Card, Empty, Kpi, PageHeader, ProgressBar, StatusBadge } from "@/components/ui";
import { ActionForm, InlineAction, SubmitButton } from "@/components/form";
import { MemberForm } from "../member-form";
import { deleteMember } from "../actions";
import { bookSingle } from "../../progress/actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const m = await prisma.member.findUnique({ where: { id: (await params).id }, select: { markNo: true } });
  return { title: m?.markNo ?? "Member" };
}

export default async function MemberDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const project = await requireProject();
  const { id } = await params;
  const member = await prisma.member.findFirst({
    where: { id, projectId: project.id },
    include: {
      area: true,
      contractor: true,
      stages: true,
      entries: { orderBy: [{ workDate: "desc" }, { createdAt: "desc" }], include: { stage: true, enteredBy: { select: { name: true } }, reviewedBy: { select: { name: true } } } },
      inspections: { orderBy: { inspectedAt: "desc" }, include: { inspector: { select: { name: true } } } },
      ncrs: { orderBy: { raisedAt: "desc" } },
      punchItems: { orderBy: { raisedAt: "desc" } },
      shipmentItems: { include: { shipment: true } },
    },
  });
  if (!member) notFound();
  const [stages, areas, contractors] = await Promise.all([
    prisma.stage.findMany({ where: { projectId: project.id }, orderBy: { sequence: "asc" } }),
    prisma.area.findMany({ where: { projectId: project.id }, orderBy: { code: "asc" } }),
    prisma.contractor.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } }),
  ]);
  const q = new Map(member.stages.map((s) => [s.stageId, s.qtyDone]));
  const pending = new Map<string, number>();
  for (const e of member.entries) if (e.status === "PENDING_QC") pending.set(e.stageId, (pending.get(e.stageId) ?? 0) + e.quantity);
  const pct = memberPercent(member.quantity, stages, q);
  const totalKg = member.quantity * member.unitWeightKg;

  return (
    <>
      <PageHeader
        title={member.markNo}
        subtitle={<><Link href="/members" className="hover:underline">Member Register</Link> · {member.area.code} {member.area.name} · {member.memberType}</>}
        actions={<a className="btn btn-secondary" href={`/api/export/member-card?id=${member.id}`}>Export history</a>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Completion" value={`${pct.toFixed(1)}%`} sub={currentStageCode(member.quantity, stages, q)} />
        <Kpi label="Quantity × unit weight" value={`${member.quantity} × ${fmtNum(member.unitWeightKg, 1)} kg`} sub={`${fmtNum(totalKg / 1000, 3)} t total`} />
        <Kpi label="Profile / grade" value={<span className="text-lg">{member.profile ?? "—"}</span>} sub={`${member.grade ?? "—"} · L = ${member.lengthMm ? `${fmtNum(member.lengthMm)} mm` : "—"}`} />
        <Kpi label="Drawing" value={<span className="text-lg">{member.drawingNo ?? "—"}</span>} sub={`Rev ${member.revision ?? "—"} · ${member.contractor?.name ?? "No contractor"}`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Stage status" bodyClass="overflow-x-auto">
          <table className="table">
            <thead><tr><th>#</th><th>Stage</th><th className="num">Weight</th><th className="num">Done</th><th className="num">Pending QC</th><th className="w-1/3">Progress</th></tr></thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.id}>
                  <td className="text-muted">{s.sequence}</td>
                  <td>{s.name} <span className="text-xs text-muted">({s.code}{s.qcHold ? ", QC hold" : ""})</span></td>
                  <td className="num">{s.weight}%</td>
                  <td className="num">{q.get(s.id) ?? 0} / {member.quantity}</td>
                  <td className="num">{pending.get(s.id) ?? "—"}</td>
                  <td><ProgressBar value={((q.get(s.id) ?? 0) / member.quantity) * 100} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {can(user.role, "progress.enter") ? (
          <Card title="Book progress">
            <ActionForm action={bookSingle} resetOnSuccess>
              <input type="hidden" name="memberId" value={member.id} />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <label className="block"><span className="label">Stage</span>
                  <select className="input" name="stageId">{stages.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}</select>
                </label>
                <label className="block"><span className="label">Qty (negative to reverse)</span><input className="input" name="quantity" type="number" step={1} defaultValue={member.quantity} required /></label>
                <label className="block"><span className="label">Work date</span><input className="input" name="workDate" type="date" required defaultValue={fmtDate(todayUtc())} max={fmtDate(todayUtc())} /></label>
                <label className="block"><span className="label">Remarks</span><input className="input" name="remarks" /></label>
              </div>
              <div className="mt-3"><SubmitButton>Book</SubmitButton></div>
            </ActionForm>
            <p className="mt-3 text-xs text-muted">Quantities cannot exceed what is approved at the previous stage. QC-hold stages go to the QC queue before they earn progress.</p>
          </Card>
        ) : (
          <Card title="Shipments">
            <ShipmentList items={member.shipmentItems} />
          </Card>
        )}
      </div>

      <Card title={`Progress history (${member.entries.length})`} className="mt-4" bodyClass="overflow-x-auto">
        {member.entries.length === 0 ? <Empty>No progress booked.</Empty> : (
          <table className="table">
            <thead><tr><th>Work date</th><th>Stage</th><th className="num">Qty</th><th>Status</th><th>Entered by</th><th>Reviewed</th><th>Remarks</th></tr></thead>
            <tbody>
              {member.entries.map((e) => (
                <tr key={e.id}>
                  <td className="tabular">{fmtDate(e.workDate)}</td>
                  <td>{e.stage.code}</td>
                  <td className="num">{e.quantity}</td>
                  <td><StatusBadge value={e.status} /></td>
                  <td className="text-xs">{e.enteredBy.name}<div className="text-muted">{fmtDateTime(e.createdAt)}</div></td>
                  <td className="text-xs">{e.reviewedBy ? <>{e.reviewedBy.name}<div className="text-muted">{fmtDateTime(e.reviewedAt)}</div></> : "—"}</td>
                  <td className="text-xs text-ink-2">{[e.remarks, e.reviewNote && `QC: ${e.reviewNote}`].filter(Boolean).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title={`Inspections (${member.inspections.length})`} bodyClass="overflow-x-auto">
          {member.inspections.length === 0 ? <Empty>No inspections recorded.</Empty> : (
            <table className="table">
              <thead><tr><th>Date</th><th>Type</th><th>Result</th><th>Details</th><th>Inspector</th></tr></thead>
              <tbody>
                {member.inspections.map((i) => (
                  <tr key={i.id}>
                    <td className="tabular">{fmtDate(i.inspectedAt)}</td>
                    <td className="text-xs">{i.type.replace(/_/g, " ")}</td>
                    <td><StatusBadge value={i.result} /></td>
                    <td className="text-xs text-ink-2">
                      {i.type === "BOLT_TORQUE" && `${i.boltCount ?? "?"}× ${i.boltSize}: ${i.actualTorqueNm} / ${i.specifiedTorqueNm} Nm`}
                      {i.toleranceMm != null && `Measured ${i.measuredMm} mm / tol ${i.toleranceMm} mm`}
                      {i.remarks && <div>{i.remarks}</div>}
                    </td>
                    <td className="text-xs">{i.inspector?.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title={`NCRs & punch items (${member.ncrs.length + member.punchItems.length})`} bodyClass="overflow-x-auto">
          {member.ncrs.length + member.punchItems.length === 0 ? <Empty>None.</Empty> : (
            <table className="table">
              <tbody>
                {member.ncrs.map((n) => (
                  <tr key={n.id}><td className="font-medium">{n.number}</td><td>{n.title}</td><td><StatusBadge value={n.severity} /></td><td><StatusBadge value={n.status} /></td></tr>
                ))}
                {member.punchItems.map((p) => (
                  <tr key={p.id}><td className="font-medium">{p.number}</td><td>{p.description}</td><td><StatusBadge value={p.category} /></td><td><StatusBadge value={p.status} /></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {can(user.role, "progress.enter") && (
        <Card title="Shipments" className="mt-4"><ShipmentList items={member.shipmentItems} /></Card>
      )}

      {can(user.role, "members.edit") && (
        <Card title="Edit member" className="mt-4" actions={<InlineAction action={deleteMember} fields={{ id: member.id }} label="Delete member" variant="danger" confirm={`Delete ${member.markNo}? This cannot be undone.`} />}>
          <MemberForm member={member} areas={areas} contractors={contractors} />
        </Card>
      )}
    </>
  );
}

function ShipmentList({ items }: { items: { id: string; quantity: number; qtyReceived: number | null; damaged: number; shipment: { id: string; number: string; dispatchDate: Date; receivedDate: Date | null; status: string; laydownArea: string | null } }[] }) {
  if (items.length === 0) return <Empty>Not yet shipped.</Empty>;
  return (
    <table className="table">
      <thead><tr><th>Delivery note</th><th>Dispatched</th><th>Received</th><th className="num">Qty</th><th>Laydown</th><th>Status</th></tr></thead>
      <tbody>
        {items.map((i) => (
          <tr key={i.id}>
            <td><Link className="text-accent hover:underline" href={`/materials/${i.shipment.id}`}>{i.shipment.number}</Link></td>
            <td className="tabular">{fmtDate(i.shipment.dispatchDate)}</td>
            <td className="tabular">{fmtDate(i.shipment.receivedDate)}</td>
            <td className="num">{i.qtyReceived ?? "—"} / {i.quantity}{i.damaged ? ` (${i.damaged} dmg)` : ""}</td>
            <td>{i.shipment.laydownArea ?? "—"}</td>
            <td><StatusBadge value={i.shipment.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
