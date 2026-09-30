import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { can, type Permission } from "./rbac";
import { SESSION_COOKIE, verifySession } from "./session";

export type SessionUser = Pick<User, "id" | "email" | "name" | "role">;

/** Current user, re-validated against the DB once per request (deactivated users lose access immediately). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  if (!user || !user.active) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`You do not have permission to perform this action (${permission}).`);
  }
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError(permission);
  if (!can(user.role, permission)) throw new ForbiddenError(permission);
  return user;
}
