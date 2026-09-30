"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { audit } from "@/lib/audit";
import { runAction, type ActionState } from "@/lib/actions";
import { bookProgress, BookingError } from "@/lib/services/progress-service";
import { parseDay, todayUtc } from "@/lib/format";

async function stageByCode(projectId: string, code: string) {
  const s = await prisma.stage.findUnique({ where: { projectId_code: { projectId, code } } });
  if (!s) throw new BookingError(`Stage ${code} is not configured for this project.`);
  return s;
}

const header = z.object({
  number: z.string().trim().min(1).max(40).transform((s) => s.toUpperCase()),
  vehicleNo: z.string().trim().optional().transform((s) => s || null),
  transporter: z.string().trim().optional().transform((s) => s || null),
  dispatchDate: z.string().min(1),
  remarks: z.string().trim().max(500).optional().transform((s) => s || null),
});

export async function createShipment(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction(async () => {
    const user = await requirePermission("materials.manage");
    const project = await requireProject();
    const h = header.parse(Object.fromEntries(fd));
    const date = parseDay(h.dispatchDate);
    if (date > todayUtc()) throw new BookingError("Dispatch date cannot be in the future.");
    const items: { memberId: string; qty: number }[] = [];
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("qty_") || typeof v !== "string" || !v.trim()) continue;
      const qty = Number(v);
      if (!Number.isInteger(qty) || qty <= 0) throw new BookingError(`Invalid quantity "${v}".`);
      items.push({ memberId: k.slice(4), qty });
    }
    if (!items.length) throw new BookingError("Add at least one member to the shipment.");
    const dispatch = await stageByCode(project.id, "DISPATCH");
    const shipment = await prisma.$transaction(
      async (tx) => {
        const s = await tx.shipment.create({
          data: { projectId: project.id, number: h.number, vehicleNo: h.vehicleNo, transporter: h.transporter, dispatchDate: date, remarks: h.remarks, items: { create: items.map((i) => ({ memberId: i.memberId, quantity: i.qty })) } },
        });
        for (const i of items) {
          await bookProgress(tx, { projectId: project.id, memberId: i.memberId, stageId: dispatch.id, quantity: i.qty, workDate: date, userId: user.id, remarks: `Shipment ${s.number}`, forceApproved: true });
        }
        await audit(tx, { userId: user.id, projectId: project.id, action: "SHIPMENT_DISPATCHED", entity: "Shipment", entityId: s.id, details: { number: s.number, items: items.length } });
        return s;
      },
      { timeout: 60_000 },
    );
    id = shipment.id;
    return `Shipment ${shipment.number} created.`;
  });
  if (res.ok) redirect(`/materials/${id}`);
  return res;
}

export async function receiveShipment(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("materials.manage");
    const project = await requireProject();
    const id = String(fd.get("id"));
    const receivedDate = parseDay(String(fd.get("receivedDate") ?? ""));
    if (receivedDate > todayUtc()) throw new BookingError("Receipt date cannot be in the future.");
    const laydownArea = String(fd.get("laydownArea") ?? "").trim() || null;
    const shipment = await prisma.shipment.findFirst({ where: { id, projectId: project.id }, include: { items: { include: { member: { select: { markNo: true, areaId: true } } } } } });
    if (!shipment) throw new Error("Shipment not found.");
    if (shipment.status === "RECEIVED") throw new BookingError("Shipment has already been received.");
    if (receivedDate < shipment.dispatchDate) throw new BookingError("Receipt date is before the dispatch date.");
    const receipt = await stageByCode(project.id, "RECEIPT");

    let damagedTotal = 0;
    await prisma.$transaction(
      async (tx) => {
        const damagedMarks: string[] = [];
        for (const item of shipment.items) {
          const got = Number(fd.get(`recv_${item.id}`) ?? item.quantity);
          const damaged = Number(fd.get(`dmg_${item.id}`) ?? 0);
          if (!Number.isInteger(got) || got < 0 || got > item.quantity) throw new BookingError(`${item.member.markNo}: received qty must be 0–${item.quantity}.`);
          if (!Number.isInteger(damaged) || damaged < 0 || damaged > got) throw new BookingError(`${item.member.markNo}: damaged qty must be 0–${got}.`);
          await tx.shipmentItem.update({ where: { id: item.id }, data: { qtyReceived: got, damaged } });
          const good = got - damaged;
          if (good > 0) await bookProgress(tx, { projectId: project.id, memberId: item.memberId, stageId: receipt.id, quantity: good, workDate: receivedDate, userId: user.id, remarks: `Received via ${shipment.number}${laydownArea ? ` → ${laydownArea}` : ""}`, forceApproved: true });
          if (damaged > 0) {
            damagedMarks.push(`${item.member.markNo} ×${damaged}`);
            damagedTotal += damaged;
          }
        }
        await tx.shipment.update({ where: { id }, data: { status: "RECEIVED", receivedDate, laydownArea } });
        if (damagedMarks.length) {
          const rows = await tx.$queryRaw<{ n: number | null }[]>`SELECT MAX(CAST(SUBSTRING(number FROM '[0-9]+$') AS INTEGER)) AS n FROM "Ncr" WHERE "projectId" = ${project.id}`;
          const number = `NCR-${String((rows[0]?.n ?? 0) + 1).padStart(3, "0")}`;
          await tx.ncr.create({
            data: { projectId: project.id, number, title: `Damaged on receipt — ${shipment.number}`, description: `Pieces damaged in transit: ${damagedMarks.join(", ")}.`, severity: "MINOR", areaId: shipment.items[0]?.member.areaId ?? null, raisedById: user.id },
          });
        }
        await audit(tx, { userId: user.id, projectId: project.id, action: "SHIPMENT_RECEIVED", entity: "Shipment", entityId: id, details: { number: shipment.number, laydownArea, damaged: damagedMarks } });
      },
      { timeout: 60_000 },
    );
    revalidatePath(`/materials/${id}`);
    return `Shipment received.${damagedTotal ? ` ${damagedTotal} damaged piece(s) logged and an NCR was raised.` : ""}`;
  });
}
