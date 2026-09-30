// Edge-safe JWT helpers (used by middleware and server code).
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE = "st_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export interface SessionPayload {
  sub: string;
  role: Role;
  name: string;
}

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { sub: payload.sub, role: payload.role as Role, name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}
