// MTO / member register import — header mapping and row validation (pure).

export const MEMBER_TYPES = [
  "COLUMN",
  "BEAM",
  "BRACING",
  "GIRT",
  "PURLIN",
  "TRUSS",
  "PLATFORM",
  "STAIR",
  "LADDER",
  "HANDRAIL",
  "GRATING",
  "BASE PLATE",
  "MISC",
] as const;

export interface MtoRow {
  markNo: string;
  areaCode: string;
  memberType: string;
  profile?: string;
  grade?: string;
  drawingNo?: string;
  revision?: string;
  lengthMm?: number;
  quantity: number;
  unitWeightKg: number;
  contractor?: string;
}

export interface MtoIssue {
  row: number; // 1-based spreadsheet row
  message: string;
}

/** Accepted header aliases (normalised: lowercase, alphanumerics only). */
const HEADER_ALIASES: Record<keyof MtoRow, string[]> = {
  markNo: ["markno", "mark", "piecemark", "piecemarkno", "assemblymark", "membermark"],
  areaCode: ["area", "areacode", "unit", "structure", "zone"],
  memberType: ["type", "membertype", "category", "description"],
  profile: ["profile", "section", "size"],
  grade: ["grade", "material", "materialgrade"],
  drawingNo: ["drawing", "drawingno", "dwg", "dwgno", "gadrawing"],
  revision: ["rev", "revision"],
  lengthMm: ["length", "lengthmm", "len", "lenmm"],
  quantity: ["qty", "quantity", "nos", "no"],
  unitWeightKg: ["unitweight", "unitweightkg", "unitwt", "unitwtkg", "unitmass", "unitmasskg", "weight", "weightkg", "wtkg", "wt"],
  contractor: ["contractor", "erector", "subcontractor"],
};

export const normaliseHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

export function mapHeaders(headers: string[]): { map: Partial<Record<keyof MtoRow, number>>; missing: string[] } {
  const map: Partial<Record<keyof MtoRow, number>> = {};
  const norm = headers.map(normaliseHeader);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof MtoRow, string[]][]) {
    const idx = norm.findIndex((h) => aliases.includes(h));
    if (idx >= 0) map[field] = idx;
  }
  const required: (keyof MtoRow)[] = ["markNo", "areaCode", "memberType", "quantity", "unitWeightKg"];
  return { map, missing: required.filter((f) => map[f] === undefined) };
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function num(v: unknown): number | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Validates raw spreadsheet rows. `rows` excludes the header; `firstRowNumber` is the
 * spreadsheet row number of rows[0] (for error messages).
 */
export function parseMtoRows(
  headers: string[],
  rows: unknown[][],
  firstRowNumber = 2,
): { rows: MtoRow[]; issues: MtoIssue[] } {
  const { map, missing } = mapHeaders(headers);
  if (missing.length) {
    return { rows: [], issues: [{ row: 1, message: `Missing required column(s): ${missing.join(", ")}` }] };
  }
  const get = (r: unknown[], f: keyof MtoRow) => (map[f] === undefined ? undefined : r[map[f]!]);
  const out: MtoRow[] = [];
  const issues: MtoIssue[] = [];
  const seen = new Map<string, number>();

  rows.forEach((r, i) => {
    const rowNo = firstRowNumber + i;
    if (r.every((c) => str(c) === undefined)) return; // blank line
    const errs: string[] = [];
    const markNo = str(get(r, "markNo"))?.toUpperCase();
    const areaCode = str(get(r, "areaCode"))?.toUpperCase();
    const memberType = str(get(r, "memberType"))?.toUpperCase();
    const quantity = num(get(r, "quantity"));
    const unitWeightKg = num(get(r, "unitWeightKg"));
    const lengthMm = num(get(r, "lengthMm"));

    if (!markNo) errs.push("mark no. is required");
    if (!areaCode) errs.push("area is required");
    if (!memberType) errs.push("member type is required");
    if (quantity === undefined || !Number.isInteger(quantity) || quantity < 1) errs.push("qty must be a whole number ≥ 1");
    if (unitWeightKg === undefined || Number.isNaN(unitWeightKg) || unitWeightKg <= 0) errs.push("unit weight must be > 0 kg");
    if (lengthMm !== undefined && (Number.isNaN(lengthMm) || lengthMm < 0)) errs.push("length must be ≥ 0");
    if (markNo) {
      if (seen.has(markNo)) errs.push(`duplicate mark no. (also row ${seen.get(markNo)})`);
      else seen.set(markNo, rowNo);
    }
    if (errs.length) {
      issues.push({ row: rowNo, message: `${markNo ?? "(no mark)"}: ${errs.join("; ")}` });
      return;
    }
    out.push({
      markNo: markNo!,
      areaCode: areaCode!,
      memberType: memberType!,
      profile: str(get(r, "profile")),
      grade: str(get(r, "grade")),
      drawingNo: str(get(r, "drawingNo")),
      revision: str(get(r, "revision")),
      lengthMm,
      quantity: quantity!,
      unitWeightKg: unitWeightKg!,
      contractor: str(get(r, "contractor")),
    });
  });
  return { rows: out, issues };
}

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
