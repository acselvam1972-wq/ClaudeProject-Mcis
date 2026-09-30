"use client";

import { useState } from "react";

const TYPES = ["BOLT_TORQUE", "VERTICALITY", "ALIGNMENT", "WELD_VISUAL", "PAINT_DFT", "ITP_HOLD", "FINAL"];

export function InspectionFields({ today }: { today: string }) {
  const [type, setType] = useState("BOLT_TORQUE");
  const measured = type === "VERTICALITY" || type === "ALIGNMENT";
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <label className="block"><span className="label">Type *</span>
        <select className="input" name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">Mark no.</span><input className="input" name="markNo" placeholder="PR-01-CO001" /></label>
      <label className="block"><span className="label">ITP / checklist ref.</span><input className="input" name="reference" placeholder="ITP-STR-007" /></label>
      <label className="block"><span className="label">Date *</span><input className="input" type="date" name="inspectedAt" defaultValue={today} max={today} required /></label>
      {type === "BOLT_TORQUE" && (
        <>
          <label className="block"><span className="label">Bolt size</span><input className="input" name="boltSize" placeholder="M24 8.8" /></label>
          <label className="block"><span className="label">No. of bolts</span><input className="input" type="number" min={1} name="boltCount" /></label>
          <label className="block"><span className="label">Specified torque (Nm)</span><input className="input" type="number" step="any" name="specifiedTorqueNm" /></label>
          <label className="block"><span className="label">Min. measured torque (Nm)</span><input className="input" type="number" step="any" name="actualTorqueNm" /></label>
        </>
      )}
      {measured && (
        <>
          <label className="block"><span className="label">Tolerance (± mm)</span><input className="input" type="number" step="any" min={0} name="toleranceMm" /></label>
          <label className="block"><span className="label">Measured deviation (mm)</span><input className="input" type="number" step="any" name="measuredMm" /></label>
        </>
      )}
      <label className="block"><span className="label">Result *</span>
        <select className="input" name="result" defaultValue="PASSED"><option>PASSED</option><option>FAILED</option><option>PENDING</option></select>
      </label>
      <label className="col-span-2 block md:col-span-4"><span className="label">Remarks</span><input className="input" name="remarks" /></label>
      {(type === "BOLT_TORQUE" || measured) && <p className="col-span-2 text-xs text-muted md:col-span-4">When measurements are entered, the result is computed automatically against the specification.</p>}
    </div>
  );
}
