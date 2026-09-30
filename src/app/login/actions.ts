"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/session";

// Basic in-memory brute-force protection (per instance). Use a shared store behind a load balancer.
const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60_000;

export async function login(_: { error: string }, formData: FormData): Promise<{ error: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nextRaw = String(formData.get("next") ?? "/");
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${email}|${ip}`;

  const a = attempts.get(key);
  if (a && a.until > Date.now()) return { error: "Too many failed attempts. Try again in a few minutes." };

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    const count = (a?.until && a.until > Date.now() ? a.count : (a?.count ?? 0)) + 1;
    attempts.set(key, { count, until: count >= MAX_ATTEMPTS ? Date.now() + LOCK_MS : 0 });
    return { error: "Invalid email or password." };
  }
  attempts.delete(key);

  const token = await signSession({ sub: user.id, role: user.role, name: user.name });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  await audit(prisma, { userId: user.id, action: "LOGIN", entity: "User", entityId: user.id, details: { ip } });
  redirect(next);
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
