import { describe, expect, it } from "vitest";
import { mapHeaders, parseCsv, parseMtoRows } from "./mto";

describe("mapHeaders", () => {
  it("maps common aliases", () => {
    const { map, missing } = mapHeaders(["Piece Mark", "Area", "Type", "Section", "Qty", "Unit Wt (kg)", "Dwg No"]);
    expect(missing).toEqual([]);
    expect(map.markNo).toBe(0);
    expect(map.profile).toBe(3);
    expect(map.drawingNo).toBe(6);
  });
  it("reports missing required columns", () => {
    expect(mapHeaders(["Mark", "Qty"]).missing).toEqual(["areaCode", "memberType", "unitWeightKg"]);
  });
});

describe("parseMtoRows", () => {
  const headers = ["Mark No", "Area", "Type", "Profile", "Qty", "Unit Weight", "Length"];
  it("validates and normalises rows", () => {
    const { rows, issues } = parseMtoRows(headers, [
      ["c1-a", "pr-01", "column", "UC 305x305x97", "2", "1,164.5", "12000"],
      ["", "", "", "", "", "", ""],
      ["B1", "PR-01", "BEAM", "", "0", "10", ""],
      ["C1-A", "PR-01", "COLUMN", "", "1", "10", ""],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ markNo: "C1-A", areaCode: "PR-01", memberType: "COLUMN", quantity: 2, unitWeightKg: 1164.5, lengthMm: 12000 });
    expect(issues.map((i) => i.row)).toEqual([4, 5]);
    expect(issues[1].message).toMatch(/duplicate/);
  });
});

describe("parseCsv", () => {
  it("handles quotes, escaped quotes and CRLF", () => {
    expect(parseCsv('a,"b,c","d ""x"""\r\n1,2,3')).toEqual([
      ["a", "b,c", 'd "x"'],
      ["1", "2", "3"],
    ]);
  });
});
