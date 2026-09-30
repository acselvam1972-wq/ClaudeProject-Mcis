"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, { error: "" });
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && (
        <p role="alert" className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical-ink">
          {state.error}
        </p>
      )}
      <button className="btn btn-primary w-full py-2" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
