import { ZodError } from "zod";
import { ForbiddenError } from "./auth";
import { BookingError } from "./services/progress-service";

export interface ActionState {
  ok: boolean;
  message: string;
  /** Changes on every submission so client forms can react (e.g. reset). */
  ts?: number;
}

export const initialState: ActionState = { ok: false, message: "" };

/** Runs a server-action body, turning expected errors into user-facing messages. */
export async function runAction(fn: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message, ts: Date.now() };
  } catch (e) {
    if (e instanceof ZodError) {
      return { ok: false, message: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "), ts: Date.now() };
    }
    if (e instanceof ForbiddenError || e instanceof BookingError) return { ok: false, message: e.message, ts: Date.now() };
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return { ok: false, message: "A record with this identifier already exists.", ts: Date.now() };
    }
    if (e instanceof Error && e.message.startsWith("NEXT_")) throw e; // redirect / notFound
    console.error(e);
    return { ok: false, message: e instanceof Error ? e.message : "Unexpected error", ts: Date.now() };
  }
}
