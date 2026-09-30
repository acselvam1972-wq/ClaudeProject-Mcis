// Integration test against a real PostgreSQL database (runs when DATABASE_URL is set).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { bookProgress, reviewEntry } from "./progress-service";

const hasDb = !!process.env.DATABASE_URL;
const prisma = hasDb ? new PrismaClient() : (null as unknown as PrismaClient);
const tag = `IT-${Date.now()}`;
let projectId = "";
let userId = "";
let memberId = "";
const stage: Record<string, string> = {};
const day = new Date(Date.UTC(2026, 0, 15));

describe.skipIf(!hasDb)("bookProgress (integration)", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `${tag}@test.local`, name: "IT", passwordHash: "x", role: "SITE_ENGINEER" } });
    userId = user.id;
    const p = await prisma.project.create({
      data: {
        code: tag, name: "Integration", startDate: day, endDate: new Date(Date.UTC(2026, 11, 31)),
        stages: { create: [
          { code: "FAB", name: "Fab", sequence: 1, weight: 40 },
          { code: "BOLT", name: "Bolt", sequence: 2, weight: 60, qcHold: true },
        ] },
        areas: { create: [{ code: "A1", name: "Area" }] },
      },
      include: { stages: true, areas: true },
    });
    projectId = p.id;
    for (const s of p.stages) stage[s.code] = s.id;
    const m = await prisma.member.create({ data: { projectId, areaId: p.areas[0].id, markNo: "M1", memberType: "BEAM", quantity: 2, unitWeightKg: 100 } });
    memberId = m.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const book = (code: string, quantity: number) =>
    prisma.$transaction((tx) => bookProgress(tx, { projectId, memberId, stageId: stage[code], quantity, workDate: day, userId }));
  const done = async (code: string) =>
    (await prisma.memberStage.findUnique({ where: { memberId_stageId: { memberId, stageId: stage[code] } } }))?.qtyDone ?? 0;

  it("blocks a stage ahead of its predecessor", async () => {
    await expect(book("BOLT", 1)).rejects.toThrow(/exceeds approved FAB/);
  });

  it("books a non-hold stage straight to approved", async () => {
    const e = await book("FAB", 2);
    expect(e.status).toBe("APPROVED");
    expect(await done("FAB")).toBe(2);
  });

  it("routes QC-hold stages through approval and counts pending against the cap", async () => {
    const e = await book("BOLT", 2);
    expect(e.status).toBe("PENDING_QC");
    expect(await done("BOLT")).toBe(0);
    await expect(book("BOLT", 1)).rejects.toThrow(/exceed member quantity/);
    await prisma.$transaction((tx) => reviewEntry(tx, { projectId, entryId: e.id, approve: true, userId }));
    expect(await done("BOLT")).toBe(2);
    await expect(prisma.$transaction((tx) => reviewEntry(tx, { projectId, entryId: e.id, approve: true, userId }))).rejects.toThrow(/already been reviewed/);
  });

  it("prevents reversing a stage below what the next stage has booked", async () => {
    await expect(book("FAB", -1)).rejects.toThrow(/cannot reduce FAB below BOLT/);
  });

  it("serialises concurrent bookings on the same member", async () => {
    const m2 = await prisma.member.create({ data: { projectId, areaId: (await prisma.area.findFirstOrThrow({ where: { projectId } })).id, markNo: "M2", memberType: "BEAM", quantity: 3, unitWeightKg: 50 } });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => prisma.$transaction((tx) => bookProgress(tx, { projectId, memberId: m2.id, stageId: stage.FAB, quantity: 1, workDate: day, userId }))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const ms = await prisma.memberStage.findUnique({ where: { memberId_stageId: { memberId: m2.id, stageId: stage.FAB } } });
    expect(ms?.qtyDone).toBe(3);
  });
});
