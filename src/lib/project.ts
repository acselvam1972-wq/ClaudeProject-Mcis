import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "./db";

export const PROJECT_COOKIE = "st_project";

export const getProjects = cache(async () =>
  prisma.project.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
);

/** Active project from cookie, falling back to the first project. */
export const getCurrentProject = cache(async () => {
  const store = await cookies();
  const id = store.get(PROJECT_COOKIE)?.value;
  if (id) {
    const p = await prisma.project.findUnique({ where: { id } });
    if (p) return p;
  }
  return prisma.project.findFirst({ orderBy: { code: "asc" } });
});

export async function requireProject() {
  const project = await getCurrentProject();
  if (!project) throw new Error("No project configured. Create a project in Admin first.");
  return project;
}
