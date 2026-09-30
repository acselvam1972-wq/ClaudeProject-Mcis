import { describe, expect, it } from "vitest";
import { generateSCurve, parsePlanCsv } from "./plan";

describe("generateSCurve", () => {
  it("starts at 0, ends at 100 and is monotonic", () => {
    const pts = generateSCurve(new Date("2026-01-01"), new Date("2026-07-01"), 7);
    expect(pts[0]).toEqual({ date: "2026-01-01", pct: 0 });
    expect(pts[pts.length - 1]).toEqual({ date: "2026-07-01", pct: 100 });
    for (let i = 1; i < pts.length; i++) expect(pts[i].pct).toBeGreaterThanOrEqual(pts[i - 1].pct);
  });
  it("is S-shaped (slow start, fast middle)", () => {
    const pts = generateSCurve(new Date("2026-01-01"), new Date("2026-12-31"), 30);
    const firstStep = pts[1].pct - pts[0].pct;
    const mid = Math.floor(pts.length / 2);
    expect(pts[mid].pct - pts[mid - 1].pct).toBeGreaterThan(firstStep * 3);
  });
  it("rejects invalid ranges", () => {
    expect(() => generateSCurve(new Date("2026-02-01"), new Date("2026-01-01"))).toThrow();
  });
});

describe("parsePlanCsv", () => {
  it("parses with header", () => {
    expect(parsePlanCsv("date,planned\n2026-01-01,0\n2026-02-01,12.5\n")).toEqual([
      { date: "2026-01-01", pct: 0 },
      { date: "2026-02-01", pct: 12.5 },
    ]);
  });
  it("rejects decreasing plans", () => {
    expect(() => parsePlanCsv("2026-01-01,10\n2026-02-01,5")).toThrow(/decrease/);
  });
});
