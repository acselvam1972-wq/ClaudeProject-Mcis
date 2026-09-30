"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";
import type { ActionState } from "@/lib/actions";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/** Pending flag for forms submitted manually (useFormStatus only tracks native submissions). */
const PendingContext = createContext(false);

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  confirm,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => submitWithoutReset(e, formAction, confirm)}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      <FormMessage state={state} />
    </form>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={clsx(
        "mt-3 whitespace-pre-line rounded-md border px-3 py-2 text-sm",
        state.ok ? "border-good/40 bg-good/10 text-good-ink" : "border-critical/40 bg-critical/10 text-critical-ink",
      )}
    >
      {state.ok ? "✓ " : "✕ "}
      {state.message}
    </p>
  );
}

export function SubmitButton({ children, variant = "primary", className }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; className?: string }) {
  const status = useFormStatus();
  const pending = useContext(PendingContext) || status.pending;
  return (
    <button type="submit" disabled={pending} className={clsx("btn", `btn-${variant}`, className)}>
      {pending ? "Working…" : children}
    </button>
  );
}

/**
 * Submits via the action without React 19's automatic form reset, so users keep
 * their input when the server rejects a submission. The submitter's name/value is kept.
 */
export function submitWithoutReset(e: React.FormEvent<HTMLFormElement>, formAction: (fd: FormData) => void, confirm?: string) {
  e.preventDefault();
  if (confirm && !window.confirm(confirm)) return;
  const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
  startTransition(() => formAction(fd));
}

/** Small inline form for one-click row actions (approve, close…). */
export function InlineAction({ action, fields, label, variant = "secondary", confirm }: { action: Action; fields: Record<string, string>; label: string; variant?: "primary" | "secondary" | "danger"; confirm?: string }) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  return (
    <form
      action={formAction}
      className="inline"
      onSubmit={(e) => submitWithoutReset(e, formAction, confirm)}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <PendingContext.Provider value={pending}>
        <SubmitButton variant={variant} className="btn-sm">{label}</SubmitButton>
      </PendingContext.Provider>
      {!state.ok && state.message && <span className="ml-2 text-xs text-critical-ink">{state.message}</span>}
    </form>
  );
}
