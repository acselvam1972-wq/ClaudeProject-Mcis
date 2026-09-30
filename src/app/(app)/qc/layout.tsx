import { prisma } from "@/lib/db";
import { requireProject } from "@/lib/project";
import { PageHeader } from "@/components/ui";
import { RouteTabs } from "@/components/route-tabs";

export default async function QcLayout({ children }: { children: React.ReactNode }) {
  const project = await requireProject();
  const [pending, failed, ncr, punch] = await Promise.all([
    prisma.progressEntry.count({ where: { status: "PENDING_QC", member: { projectId: project.id } } }),
    prisma.inspection.count({ where: { projectId: project.id, result: { in: ["FAILED", "PENDING"] } } }),
    prisma.ncr.count({ where: { projectId: project.id, status: { not: "CLOSED" } } }),
    prisma.punchItem.count({ where: { projectId: project.id, status: "OPEN" } }),
  ]);
  return (
    <>
      <PageHeader title="QA / QC" subtitle="Hold-point approvals, inspection records, non-conformances and punch list." />
      <RouteTabs
        tabs={[
          { href: "/qc", label: "Approval queue", count: pending },
          { href: "/qc/inspections", label: "Inspections", count: failed },
          { href: "/qc/ncr", label: "NCRs", count: ncr },
          { href: "/qc/punch", label: "Punch list", count: punch },
        ]}
      />
      {children}
    </>
  );
}
