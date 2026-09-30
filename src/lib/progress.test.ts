import { describe, expect, it } from "vitest";
import {
  cumulativeActual,
  currentStageCode,
  earnedKg,
  memberPercent,
  mergeCurves,
  plannedAt,
  spi,
  validateBooking,
  validateStageWeights,
} from "./progress";

const stages = [
  { id: "fab", code: "FAB", sequence: 1, weight: 20 },
  { id: "rcv", code: "RECEIPT", sequence: 2, weight: 10 },
  { id: "erc", code: "ERECT", sequence: 3, weight: 50 },
  { id: "fin", code: "FINAL", sequence: 4, weight: 20 },
];

describe("earnedKg", () => {
  it("weights tonnage by stage share", () => {
    expect(earnedKg(500, 4, 50)).toBe(1000);
  });
});

describe("validateStageWeights", () => {
  it("accepts weights summing to 100", () => {
    expect(validateStageWeights(stages)).toBeNull();
  });
  it("rejects wrong totals and duplicate codes", () => {
    expect(validateStageWeights([{ code: "A", weight: 60 }, { code: "B", weight: 30 }])).toMatch(/total 100/);
    expect(validateStageWeights([{ code: "A", weight: 50 }, { code: "A", weight: 50 }])).toMatch(/unique/);
  });
});

describe("validateBooking", () => {
  const base = { memberQty: 10, stageCode: "ERECT", prevStageCode: "RECEIPT" };
  it("allows booking within previous stage approved qty", () => {
    expect(validateBooking({ ...base, bookedAtStage: 2, prevStageApproved: 6, addQty: 4 })).toBeNull();
  });
  it("blocks booking beyond previous stage", () => {
    expect(validateBooking({ ...base, bookedAtStage: 2, prevStageApproved: 5, addQty: 4 })).toMatch(/exceeds approved RECEIPT/);
  });
  it("blocks booking beyond member quantity", () => {
    expect(validateBooking({ ...base, bookedAtStage: 8, prevStageApproved: null, addQty: 3 })).toMatch(/exceed member quantity/);
  });
  it("allows negative corrections but not below zero", () => {
    expect(validateBooking({ ...base, bookedAtStage: 3, prevStageApproved: 3, addQty: -2 })).toBeNull();
    expect(validateBooking({ ...base, bookedAtStage: 1, prevStageApproved: 3, addQty: -2 })).toMatch(/below zero/);
  });
  it("rejects zero and fractional quantities", () => {
    expect(validateBooking({ ...base, bookedAtStage: 0, prevStageApproved: null, addQty: 0 })).toMatch(/non-zero/);
    expect(validateBooking({ ...base, bookedAtStage: 0, prevStageApproved: null, addQty: 1.5 })).toMatch(/whole/);
  });
});

describe("memberPercent / currentStageCode", () => {
  it("computes weighted completion", () => {
    const q = new Map([["fab", 4], ["rcv", 4], ["erc", 2]]);
    expect(memberPercent(4, stages, q)).toBe(20 + 10 + 25);
    expect(currentStageCode(4, stages, q)).toBe("ERECT (partial)");
  });
  it("reports not started and complete", () => {
    expect(currentStageCode(2, stages, new Map())).toBe("NOT STARTED");
    const all = new Map(stages.map((s) => [s.id, 2]));
    expect(currentStageCode(2, stages, all)).toBe("FINAL");
    expect(memberPercent(2, stages, all)).toBe(100);
  });
});

describe("curves", () => {
  const plan = [
    { date: "2026-01-01", pct: 0 },
    { date: "2026-01-11", pct: 10 },
    { date: "2026-01-21", pct: 30 },
  ];
  it("interpolates planned %", () => {
    expect(plannedAt(plan, "2026-01-06")).toBeCloseTo(5);
    expect(plannedAt(plan, "2026-01-16")).toBeCloseTo(20);
    expect(plannedAt(plan, "2025-12-01")).toBe(0);
    expect(plannedAt(plan, "2026-03-01")).toBe(30);
  });
  it("accumulates actual and caps at 100", () => {
    const c = cumulativeActual(
      [
        { date: "2026-01-03", earnedKg: 500 },
        { date: "2026-01-02", earnedKg: 500 },
        { date: "2026-01-04", earnedKg: 5000 },
      ],
      2000,
    );
    expect(c.map((x) => x.pct)).toEqual([25, 50, 100]);
  });
  it("merges series and stops actual at today", () => {
    const merged = mergeCurves(plan, [{ date: "2026-01-05", pct: 3 }], "2026-01-12");
    expect(merged.find((p) => p.date === "2026-01-11")?.actual).toBe(3);
    expect(merged.find((p) => p.date === "2026-01-21")?.actual).toBeUndefined();
    expect(merged.find((p) => p.date === "2026-01-12")?.planned).toBe(12);
  });
  it("computes SPI", () => {
    expect(spi(45, 50)).toBeCloseTo(0.9);
    expect(spi(10, 0)).toBeNull();
  });
});
