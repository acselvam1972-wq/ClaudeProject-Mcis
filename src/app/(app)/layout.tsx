import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Logo } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getCurrentProject, getProjects } from "@/lib/project";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { ProjectSwitcher, SideNav, type NavItem } from "@/components/nav";
import { logout } from "../login/actions";
import { switchProject } from "./shell-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [projects, project] = await Promise.all([getProjects(), getCurrentProject()]);
  const pendingQc = project
    ? await prisma.progressEntry.count({ where: { status: "PENDING_QC", member: { projectId: project.id } } })
    : 0;

  const items: NavItem[] = [
    { href: "/", label: "Dashboard", icon: "▦" },
    { href: "/members", label: "Member Register", icon: "☰" },
    { href: "/progress", label: "Daily Progress", icon: "✎" },
    { href: "/planning", label: "Planning & S-Curve", icon: "∿" },
    { href: "/qc", label: "QA / QC", icon: "✓", badge: pendingQc },
    { href: "/materials", label: "Material Tracking", icon: "⛟" },
    { href: "/reports", label: "Reports", icon: "⎙" },
  ];
  if (can(user.role, "project.manage") || can(user.role, "users.manage") || can(user.role, "audit.view")) {
    items.push({ href: "/admin", label: "Administration", icon: "⚙" });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar py-4 md:flex">
        <div className="mb-5 flex items-center gap-2 px-4 text-base font-semibold text-white">
          <Logo /> SteelTrack
        </div>
        <SideNav items={items} />
        <div className="mt-auto border-t border-white/10 px-4 pt-3 text-xs text-sidebar-ink">
          <Link href="/account" className="block truncate font-medium text-white hover:underline">{user.name}</Link>
          <div className="opacity-70">{ROLE_LABELS[user.role]}</div>
          <form action={logout} className="mt-2">
            <button className="text-sidebar-ink underline-offset-2 hover:text-white hover:underline">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur md:px-6">
          <details className="relative md:hidden">
            <summary className="btn btn-secondary btn-sm list-none">☰ Menu</summary>
            <div className="absolute left-0 top-9 z-20 w-60 rounded-md bg-sidebar py-2 shadow-lg">
              <SideNav items={items} />
              <form action={logout} className="px-4 pt-2">
                <button className="text-xs text-sidebar-ink hover:text-white">Sign out ({user.name})</button>
              </form>
            </div>
          </details>
          {projects.length > 0 ? (
            <ProjectSwitcher projects={projects} current={project?.id} action={switchProject} />
          ) : (
            <span className="text-sm text-muted">No project</span>
          )}
          {project && (
            <span className="hidden text-xs text-muted lg:inline">
              {project.client} · {project.location}
            </span>
          )}
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
