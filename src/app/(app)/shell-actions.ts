"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PROJECT_COOKIE } from "@/lib/project";

export async function switchProject(formData: FormData) {
  await requireUser();
  const id = String(formData.get("projectId") ?? "");
  const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return;
  (await cookies()).set(PROJECT_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
