import type { Role } from "@prisma/client";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  PROJECT_MANAGER: "Project Manager",
  PLANNER: "Planner",
  SITE_ENGINEER: "Site Engineer",
  QC_INSPECTOR: "QC Inspector",
  VIEWER: "Viewer (Client)",
};

export type Permission =
  | "users.manage"
  | "project.manage"
  | "members.edit"
  | "plan.edit"
  | "progress.enter"
  | "qc.approve"
  | "inspections.record"
  | "ncr.raise"
  | "ncr.close"
  | "punch.manage"
  | "materials.manage"
  | "audit.view";

const MATRIX: Record<Permission, Role[]> = {
  "users.manage": ["ADMIN"],
  "project.manage": ["ADMIN", "PROJECT_MANAGER"],
  "members.edit": ["ADMIN", "PROJECT_MANAGER", "PLANNER"],
  "plan.edit": ["ADMIN", "PROJECT_MANAGER", "PLANNER"],
  "progress.enter": ["ADMIN", "PROJECT_MANAGER", "SITE_ENGINEER"],
  "qc.approve": ["ADMIN", "QC_INSPECTOR"],
  "inspections.record": ["ADMIN", "QC_INSPECTOR"],
  "ncr.raise": ["ADMIN", "PROJECT_MANAGER", "QC_INSPECTOR", "SITE_ENGINEER"],
  "ncr.close": ["ADMIN", "PROJECT_MANAGER", "QC_INSPECTOR"],
  "punch.manage": ["ADMIN", "PROJECT_MANAGER", "QC_INSPECTOR", "SITE_ENGINEER"],
  "materials.manage": ["ADMIN", "PROJECT_MANAGER", "PLANNER", "SITE_ENGINEER"],
  "audit.view": ["ADMIN", "PROJECT_MANAGER"],
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[permission].includes(role);
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(MATRIX) as Permission[]).filter((p) => MATRIX[p].includes(role));
}
