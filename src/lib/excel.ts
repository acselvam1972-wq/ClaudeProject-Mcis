import ExcelJS from "exceljs";

export interface Column {
  header: string;
  key: string;
  width?: number;
  numFmt?: string;
}

export function addSheet(wb: ExcelJS.Workbook, name: string, columns: Column[], rows: object[], title?: string) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: title ? 3 : 1 }] });
  if (title) {
    ws.addRow([title]).font = { bold: true, size: 13 };
    ws.addRow([]);
  }
  const header = ws.addRow(columns.map((c) => c.header));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C5CAB" } };
  header.alignment = { vertical: "middle" };
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width ?? Math.max(10, c.header.length + 2);
    if (c.numFmt) col.numFmt = c.numFmt;
  });
  for (const r of rows) ws.addRow(columns.map((c) => (r as Record<string, unknown>)[c.key] ?? null));
  ws.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number, column: columns.length } };
  return ws;
}

export async function xlsxResponse(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SteelTrack";
  wb.created = new Date();
  return wb;
}
