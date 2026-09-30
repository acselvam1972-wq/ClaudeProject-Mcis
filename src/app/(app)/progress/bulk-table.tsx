"use client";

import { useRef } from "react";

export interface EligibleRow {
  id: string;
  markNo: string;
  memberType: string;
  profile: string | null;
  quantity: number;
  unitWeightKg: number;
  available: number;
  booked: number;
}

export function BulkTable({ rows }: { rows: EligibleRow[] }) {
  const ref = useRef<HTMLTableSectionElement>(null);
  const fill = (all: boolean) => {
    ref.current?.querySelectorAll<HTMLInputElement>("input[data-max]").forEach((i) => {
      i.value = all ? i.dataset.max! : "";
    });
  };
  return (
    <>
      <div className="flex gap-2 border-b border-line p-3">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => fill(true)}>Fill all available</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => fill(false)}>Clear</button>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <table className="table">
          <thead>
            <tr><th>Mark no.</th><th>Type</th><th>Profile</th><th className="num">Unit kg</th><th className="num">Member qty</th><th className="num">Booked here</th><th className="num">Available</th><th className="w-28">Qty today</th></tr>
          </thead>
          <tbody ref={ref}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.markNo}</td>
                <td className="text-xs">{r.memberType}</td>
                <td className="text-xs text-ink-2">{r.profile}</td>
                <td className="num">{r.unitWeightKg.toFixed(1)}</td>
                <td className="num">{r.quantity}</td>
                <td className="num">{r.booked}</td>
                <td className="num font-medium">{r.available}</td>
                <td>
                  <input className="input py-1 text-right" type="number" min={1} max={r.available} step={1} name={`qty_${r.id}`} data-max={r.available} aria-label={`Quantity for ${r.markNo}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
