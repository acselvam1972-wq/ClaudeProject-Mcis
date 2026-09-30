import type { Area, Contractor, Member } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/form";
import { Field } from "@/components/ui";
import { MEMBER_TYPES } from "@/lib/mto";
import { saveMember } from "./actions";

export function MemberForm({ member, areas, contractors }: { member?: Member; areas: Area[]; contractors: Contractor[] }) {
  return (
    <ActionForm action={saveMember} resetOnSuccess={!member}>
      {member && <input type="hidden" name="id" value={member.id} />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Mark no. *"><input className="input" name="markNo" required defaultValue={member?.markNo} /></Field>
        <Field label="Area *">
          <select className="input" name="areaId" required defaultValue={member?.areaId}>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}
          </select>
        </Field>
        <Field label="Member type *">
          <select className="input" name="memberType" defaultValue={member?.memberType ?? "BEAM"}>
            {[...new Set([...MEMBER_TYPES, member?.memberType].filter(Boolean))].map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Contractor">
          <select className="input" name="contractorId" defaultValue={member?.contractorId ?? ""}>
            <option value="">—</option>
            {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Profile"><input className="input" name="profile" defaultValue={member?.profile ?? ""} placeholder="UB 457x191x67" /></Field>
        <Field label="Grade"><input className="input" name="grade" defaultValue={member?.grade ?? ""} placeholder="S355JR" /></Field>
        <Field label="Drawing no."><input className="input" name="drawingNo" defaultValue={member?.drawingNo ?? ""} /></Field>
        <Field label="Revision"><input className="input" name="revision" defaultValue={member?.revision ?? ""} /></Field>
        <Field label="Length (mm)"><input className="input" name="lengthMm" type="number" min={0} step="any" defaultValue={member?.lengthMm ?? ""} /></Field>
        <Field label="Quantity *"><input className="input" name="quantity" type="number" min={1} step={1} required defaultValue={member?.quantity ?? 1} /></Field>
        <Field label="Unit weight (kg) *"><input className="input" name="unitWeightKg" type="number" min={0.01} step="any" required defaultValue={member?.unitWeightKg} /></Field>
      </div>
      <div className="mt-3"><SubmitButton>{member ? "Save changes" : "Add member"}</SubmitButton></div>
    </ActionForm>
  );
}
