"use client";

import { useActionState, useRef } from "react";
import type { ActionState } from "@/lib/actions";
import { FormMessage, submitWithoutReset } from "@/components/form";

type Action = (s: ActionState, fd: FormData) => Promise<ActionState>;

/** Wraps the approval table with select-all and approve/reject buttons. */
export function QueueForm({ action, children, canApprove }: { action: Action; children: React.ReactNode; canApprove: boolean }) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  const ref = useRef<HTMLFormElement>(null);
  const toggleAll = (on: boolean) => ref.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((c) => (c.checked = on));
  return (
    <form ref={ref} action={formAction} onSubmit={(e) => submitWithoutReset(e, formAction)}>
      {canApprove && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleAll(true)}>Select all</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleAll(false)}>Clear</button>
          <input className="input w-72" name="note" placeholder="Note / reason (required to reject)" />
          <button className="btn btn-primary btn-sm" name="decision" value="approve" disabled={pending}>✓ Approve selected</button>
          <button className="btn btn-danger btn-sm" name="decision" value="reject" disabled={pending}>✕ Reject selected</button>
        </div>
      )}
      <FormMessage state={state} />
      {children}
    </form>
  );
}
