import { prisma } from "@/lib/db";

/** GET-form filter bar for area/contractor scoping, shared by dashboard-style pages. */
export async function AreaContractorFilter({ projectId, area, contractor, extra }: { projectId: string; area?: string; contractor?: string; extra?: React.ReactNode }) {
  const [areas, contractors] = await Promise.all([
    prisma.area.findMany({ where: { projectId }, orderBy: { code: "asc" } }),
    prisma.contractor.findMany({ where: { projectId }, orderBy: { name: "asc" } }),
  ]);
  return (
    <form method="get" className="no-print flex flex-wrap items-end gap-2">
      <select name="area" defaultValue={area ?? ""} className="input w-auto" aria-label="Area">
        <option value="">All areas</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
        ))}
      </select>
      <select name="contractor" defaultValue={contractor ?? ""} className="input w-auto" aria-label="Contractor">
        <option value="">All contractors</option>
        {contractors.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {extra}
      <button className="btn btn-secondary">Apply</button>
    </form>
  );
}
