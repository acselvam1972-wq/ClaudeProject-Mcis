import type { Prisma } from "@prisma/client";
import { validateBooking } from "../progress";
import { audit } from "../audit";

type Tx = Prisma.TransactionClient;

export class BookingError extends Error {}

/**
 * Books progress for one member at one stage. Must be called inside a transaction.
 * Locks the member row so concurrent bookings on the same member serialise.
 * QC-hold stages create PENDING_QC entries that earn progress only once approved.
 */
export async function bookProgress(
  tx: Tx,
  args: {
    projectId: string;
    memberId: string;
    stageId: string;
    quantity: number;
    workDate: Date;
    userId: string;
    remarks?: string | null;
    /** Skip QC hold (e.g. system-generated dispatch/receipt bookings on non-hold stages). */
    forceApproved?: boolean;
  },
) {
  await tx.$queryRaw`SELECT id FROM "Member" WHERE id = ${args.memberId} FOR UPDATE`;
  const member = await tx.member.findFirst({
    where: { id: args.memberId, projectId: args.projectId },
    select: { id: true, markNo: true, quantity: true },
  });
  if (!member) throw new BookingError("Member not found in this project.");

  const stages = await tx.stage.findMany({ where: { projectId: args.projectId }, orderBy: { sequence: "asc" } });
  const idx = stages.findIndex((s) => s.id === args.stageId);
  if (idx < 0) throw new BookingError("Stage not found in this project.");
  const stage = stages[idx];
  const prev = idx > 0 ? stages[idx - 1] : null;

  const [approvedHere, pendingHere, prevApproved] = await Promise.all([
    tx.memberStage.findUnique({ where: { memberId_stageId: { memberId: member.id, stageId: stage.id } } }),
    tx.progressEntry.aggregate({
      where: { memberId: member.id, stageId: stage.id, status: "PENDING_QC" },
      _sum: { quantity: true },
    }),
    prev
      ? tx.memberStage.findUnique({ where: { memberId_stageId: { memberId: member.id, stageId: prev.id } } })
      : Promise.resolve(null),
  ]);

  const bookedAtStage = (approvedHere?.qtyDone ?? 0) + (pendingHere._sum.quantity ?? 0);
  const err = validateBooking({
    memberQty: member.quantity,
    bookedAtStage,
    prevStageApproved: prev ? (prevApproved?.qtyDone ?? 0) : null,
    addQty: args.quantity,
    stageCode: stage.code,
    prevStageCode: prev?.code,
  });
  if (err) throw new BookingError(`${member.markNo} — ${err}`);

  // Reductions must not undercut quantities already booked at the next stage.
  if (args.quantity < 0 && idx < stages.length - 1) {
    const next = stages[idx + 1];
    const [nextApproved, nextPending] = await Promise.all([
      tx.memberStage.findUnique({ where: { memberId_stageId: { memberId: member.id, stageId: next.id } } }),
      tx.progressEntry.aggregate({
        where: { memberId: member.id, stageId: next.id, status: "PENDING_QC" },
        _sum: { quantity: true },
      }),
    ]);
    const nextBooked = (nextApproved?.qtyDone ?? 0) + (nextPending._sum.quantity ?? 0);
    if ((approvedHere?.qtyDone ?? 0) + args.quantity < nextBooked) {
      throw new BookingError(`${member.markNo} — cannot reduce ${stage.code} below ${next.code} quantity ${nextBooked}.`);
    }
  }

  const needsQc = stage.qcHold && !args.forceApproved && args.quantity > 0;
  const entry = await tx.progressEntry.create({
    data: {
      memberId: member.id,
      stageId: stage.id,
      quantity: args.quantity,
      workDate: args.workDate,
      status: needsQc ? "PENDING_QC" : "APPROVED",
      remarks: args.remarks || null,
      enteredById: args.userId,
    },
  });
  if (!needsQc) await applyToMemberStage(tx, member.id, stage.id, args.quantity);

  await audit(tx, {
    userId: args.userId,
    projectId: args.projectId,
    action: needsQc ? "PROGRESS_SUBMITTED_FOR_QC" : "PROGRESS_BOOKED",
    entity: "ProgressEntry",
    entityId: entry.id,
    details: { markNo: member.markNo, stage: stage.code, qty: args.quantity, workDate: args.workDate.toISOString().slice(0, 10) },
  });
  return entry;
}

async function applyToMemberStage(tx: Tx, memberId: string, stageId: string, qty: number) {
  await tx.memberStage.upsert({
    where: { memberId_stageId: { memberId, stageId } },
    create: { memberId, stageId, qtyDone: qty },
    update: { qtyDone: { increment: qty } },
  });
}

/** QC decision on a pending entry. */
export async function reviewEntry(
  tx: Tx,
  args: { projectId: string; entryId: string; approve: boolean; userId: string; note?: string | null },
) {
  const entry = await tx.progressEntry.findFirst({
    where: { id: args.entryId, member: { projectId: args.projectId } },
    include: { member: { select: { markNo: true, id: true } }, stage: { select: { code: true } } },
  });
  if (!entry) throw new BookingError("Entry not found.");
  await tx.$queryRaw`SELECT id FROM "Member" WHERE id = ${entry.memberId} FOR UPDATE`;
  // Re-read under lock to avoid double approval.
  const fresh = await tx.progressEntry.findUnique({ where: { id: entry.id }, select: { status: true } });
  if (fresh?.status !== "PENDING_QC") throw new BookingError("Entry has already been reviewed.");

  await tx.progressEntry.update({
    where: { id: entry.id },
    data: {
      status: args.approve ? "APPROVED" : "REJECTED",
      reviewedById: args.userId,
      reviewedAt: new Date(),
      reviewNote: args.note || null,
    },
  });
  if (args.approve) await applyToMemberStage(tx, entry.memberId, entry.stageId, entry.quantity);
  await audit(tx, {
    userId: args.userId,
    projectId: args.projectId,
    action: args.approve ? "QC_APPROVED" : "QC_REJECTED",
    entity: "ProgressEntry",
    entityId: entry.id,
    details: { markNo: entry.member.markNo, stage: entry.stage.code, qty: entry.quantity, note: args.note ?? null },
  });
}
