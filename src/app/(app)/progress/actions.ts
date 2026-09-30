"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { runAction, type ActionState } from "@/lib/actions";
import { bookProgress, BookingError } from "@/lib/services/progress-service";
import { parseDay, todayUtc } from "@/lib/format";

function workDate(s: string) {
  const d = parseDay(s);
  if (d > todayUtc()) throw new BookingError("Work date cannot be in the future.");
  return d;
}

const single = z.object({
  memberId: z.string().min(1),
  stageId: z.string().min(1),
  quantity: z.coerce.number().int().refine((n) => n !== 0, "Quantity cannot be zero"),
  workDate: z.string().min(1),
  remarks: z.string().max(500).optional(),
});

export async function bookSingle(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("progress.enter");
    const project = await requireProject();
    const data = single.parse(Object.fromEntries(fd));
    const entry = await prisma.$transaction((tx) =>
      bookProgress(tx, { projectId: project.id, memberId: data.memberId, stageId: data.stageId, quantity: data.quantity, workDate: workDate(data.workDate), userId: user.id, remarks: data.remarks }),
    );
    revalidatePath(`/members/${data.memberId}`);
    return entry.status === "PENDING_QC" ? "Booked — awaiting QC approval." : "Progress booked.";
  });
}

export async function bookBulk(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("progress.enter");
    const project = await requireProject();
    const stageId = String(fd.get("stageId") ?? "");
    const date = workDate(String(fd.get("workDate") ?? ""));
    const remarks = String(fd.get("remarks") ?? "").slice(0, 500) || null;
    const items: { memberId: string; qty: number }[] = [];
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("qty_") || typeof v !== "string" || v.trim() === "") continue;
      const qty = Number(v);
      if (!Number.isInteger(qty) || qty <= 0) throw new BookingError(`Invalid quantity "${v}".`);
      items.push({ memberId: k.slice(4), qty });
    }
    if (items.length === 0) throw new BookingError("Enter a quantity for at least one member.");
    if (items.length > 500) throw new BookingError("Maximum 500 members per submission.");

    // All-or-nothing: a site sheet is either accepted in full or corrected and resubmitted.
    const results = await prisma.$transaction(
      async (tx) => {
        const out = [];
        for (const i of items) out.push(await bookProgress(tx, { projectId: project.id, memberId: i.memberId, stageId, quantity: i.qty, workDate: date, userId: user.id, remarks }));
        return out;
      },
      { timeout: 60_000 },
    );
    revalidatePath("/progress");
    const pending = results.filter((r) => r.status === "PENDING_QC").length;
    const total = items.reduce((s, i) => s + i.qty, 0);
    return `Booked ${total} pcs across ${items.length} marks.${pending ? ` ${pending} entries sent to QC for approval.` : ""}`;
  });
}
