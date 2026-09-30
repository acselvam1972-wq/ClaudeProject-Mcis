import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/project";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Reports" };

const REPORTS = [
  { title: "Periodic progress report (PDF)", desc: "Two-page management report: KPIs, S-curve, stage and area progress, open NCRs and Cat. A/B punch items.", href: "/api/report/pdf", cta: "Download PDF" },
  { title: "Progress report workbook (Excel)", desc: "Summary, stage, area, contractor, S-curve data, NCR register and punch list, each on its own sheet.", href: "/api/export/progress-report", cta: "Download .xlsx" },
  { title: "Member register (Excel)", desc: "Every mark with quantities per stage, current stage and completion %.", href: "/api/export/members", cta: "Download .xlsx" },
  { title: "Progress log (Excel)", desc: "Every booking with earned tonnage, status, entry and review audit fields. Filter on the Daily Progress page for a subset.", href: "/api/export/progress-log", cta: "Download .xlsx" },
  { title: "Material not yet at site (Excel)", desc: "All marks with outstanding site receipt, showing whether each is unfabricated, at the shop or in transit.", href: "/api/export/shortages", cta: "Download .xlsx" },
  { title: "MTO import template (Excel)", desc: "Blank template with the expected column headers for member register import.", href: "/api/export/mto-template", cta: "Download .xlsx" },
];

export default async function ReportsPage() {
  await requireUser();
  const project = await requireProject();
  return (
    <>
      <PageHeader title="Reports" subtitle={`Exports for ${project.code}. All reports reflect live data at the time of download.`} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => (
          <Card key={r.href} title={r.title}>
            <p className="min-h-16 text-sm text-ink-2">{r.desc}</p>
            <a className="btn btn-primary mt-3" href={r.href}>{r.cta}</a>
          </Card>
        ))}
      </div>
    </>
  );
}
