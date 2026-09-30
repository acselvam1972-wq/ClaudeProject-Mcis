import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { RouteTabs } from "@/components/route-tabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const tabs = [
    ...(can(user.role, "project.manage") ? [{ href: "/admin", label: "Project setup" }] : []),
    ...(can(user.role, "users.manage") ? [{ href: "/admin/users", label: "Users & roles" }] : []),
    ...(can(user.role, "audit.view") ? [{ href: "/admin/audit", label: "Audit trail" }] : []),
  ];
  if (tabs.length === 0) redirect("/");
  return (
    <>
      <PageHeader title="Administration" />
      <RouteTabs tabs={tabs} />
      {children}
    </>
  );
}
