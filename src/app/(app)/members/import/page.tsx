import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { importMto } from "../actions";

export const metadata = { title: "Import MTO" };

export default async function ImportPage() {
  const user = await requireUser();
  if (!can(user.role, "members.edit")) redirect("/members");
  return (
    <>
      <PageHeader title="Import MTO / member register" subtitle="Upload the fabricator's material take-off. Existing marks are updated; new marks are added." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Upload" className="lg:col-span-2">
          <ActionForm action={importMto}>
            <div className="space-y-4">
              <label className="block">
                <span className="label">File (.xlsx or .csv, max 10 MB)</span>
                <input className="input" type="file" name="file" accept=".xlsx,.csv" required />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="createAreas" /> Create missing area codes automatically
              </label>
              <fieldset className="flex gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name="mode" value="validate" defaultChecked /> Validate only (dry run)</label>
                <label className="flex items-center gap-2"><input type="radio" name="mode" value="import" /> Import</label>
              </fieldset>
              <SubmitButton>Run</SubmitButton>
            </div>
          </ActionForm>
        </Card>
        <Card title="File format">
          <p className="text-sm text-ink-2">First row must be headers. Common aliases are recognised (e.g. “Piece Mark”, “Section”, “Unit Wt (kg)”).</p>
          <table className="table mt-3">
            <thead><tr><th>Column</th><th>Required</th></tr></thead>
            <tbody>
              {[["Mark No", "✓"], ["Area", "✓"], ["Type", "✓"], ["Qty", "✓"], ["Unit Weight (kg)", "✓"], ["Profile", ""], ["Grade", ""], ["Drawing No", ""], ["Rev", ""], ["Length (mm)", ""], ["Contractor", ""]].map(([c, r]) => (
                <tr key={c}><td>{c}</td><td>{r}</td></tr>
              ))}
            </tbody>
          </table>
          {/* File download from an API route: must be a plain anchor, not client-side navigation. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="btn btn-secondary mt-4 w-full" href="/api/export/mto-template">Download template (.xlsx)</a>
          <p className="mt-3 text-xs text-muted">The whole file is validated first; if any row fails, nothing is imported.</p>
        </Card>
      </div>
    </>
  );
}
