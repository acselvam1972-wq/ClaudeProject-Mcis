# SteelTrack — Structural Steel Progress Tracker

A web app for tracking structural steel construction progress on process plant projects (pipe racks, compressor houses, heater and reactor structures, substations). It follows every piece mark from fabrication to final inspection, and measures progress by **tonnage-weighted stages** against a planned S-curve baseline.

Built with Next.js 15 (App Router, TypeScript), PostgreSQL and Prisma. Ships as a Docker image.

---

## Modules

| Module | What it does |
|---|---|
| **Dashboard** | Weighted % complete, planned vs actual, SPI, erected and received tonnage, planned-vs-actual S-curve, stage completion by tonnage, progress by area and contractor, daily output, recent activity. Can be filtered by area or contractor. |
| **Member Register** | Every mark with profile, grade, drawing and revision, quantity and weight. Shows current stage and % complete. Filters by area, type, contractor and stage reached. Each member page shows its full history, inspections, NCRs and shipments. |
| **MTO import** | `.xlsx` / `.csv` upload that recognises common header aliases (e.g. "Piece Mark", "Section", "Unit Wt (kg)"). Includes a dry-run mode. Import is all-or-nothing, existing marks are updated (upsert), and quantity cannot be reduced below progress already booked. |
| **Daily Progress** | Bulk entry by area and stage. Only members that are ready for the stage are listed, with their available quantity. Also includes a searchable, exportable progress log. |
| **Planning & S-Curve** | Project- or area-level baseline: generate a logistic S-curve, or upload a `date,percent` CSV (e.g. exported from P6 or MS Project). Weekly table of planned vs actual. |
| **QA / QC** | Hold-point approval queue (bulk approve; rejecting requires a reason). Inspection register with automatic pass/fail for bolt torque and verticality/alignment. NCRs with an Open → Under review → Closed workflow (disposition required to close). Punch list with Cat. A/B/C. |
| **Material Tracking** | Dispatch notes from the shop, which book the DISPATCH stage. Site receipt with laydown area and damaged pieces, which books RECEIPT and auto-raises an NCR for damage. Material pipeline per area (not fabricated → at shop → in transit → laydown → erected). Shortage list. |
| **Reports** | PDF management report and a multi-sheet Excel workbook (summary, stages, areas, contractors, S-curve, NCR register, punch list). Also Excel exports of the member register, progress log and shortages, plus the MTO template. |
| **Administration** | Projects, weighted stage configuration, areas, contractors, users and roles, audit trail. Multiple projects, switchable from the header. |

## Progress measurement

Each project has an ordered set of weighted stages. The weights must total 100%. Defaults:

| # | Stage | Weight | QC hold |
|---|---|---|---|
| 1 | Fabrication | 20% | |
| 2 | Blasting & Painting | 10% | ✓ |
| 3 | Dispatch from Shop | 5% | |
| 4 | Receipt at Site | 5% | |
| 5 | Erection | 35% | |
| 6 | Bolting & Torquing | 10% | ✓ |
| 7 | Alignment & Plumbness | 10% | ✓ |
| 8 | Final Inspection & Touch-up | 5% | ✓ |

```
earned kg  = Σ  unit weight × approved qty at stage × stage weight
overall %  = earned kg ÷ total scope kg
SPI        = actual % ÷ planned % (baseline interpolated to today)
```

Rules enforced on every booking, inside a transaction that locks the member row:

- The quantity booked at a stage cannot exceed the member quantity.
- It also cannot exceed the **approved** quantity at the previous stage. You cannot erect what hasn't been received, and QC-held work gates the next stage.
- Bookings on a QC-hold stage go to the approval queue. They earn progress only once a QC inspector approves them.
- A negative booking is a correction. It cannot take a stage below what the next stage already holds.
- Every change is written to the audit trail.

Changing stage weights in Admin re-weights all history, and the S-curve is recomputed. Material tracking relies on the stage codes `FAB`, `DISPATCH`, `RECEIPT` and `ERECT`.

## Roles

| Role | Can |
|---|---|
| Administrator | Everything, including user management |
| Project Manager | Project setup, stages, members, baseline, progress, NCR close, materials, audit |
| Planner | Members / MTO import, baseline, materials |
| Site Engineer | Book progress, raise NCRs, punch list, materials |
| QC Inspector | Approve/reject hold points, record inspections, NCRs, punch list |
| Viewer (Client) | Read-only dashboards, registers and reports |

Permissions are enforced on the server in every action and route (`src/lib/rbac.ts`). The UI only hides the controls a role cannot use.

## Getting started

### Docker (recommended)

```bash
export AUTH_SECRET=$(openssl rand -base64 48)
export INSECURE_COOKIES=true         # only when serving over plain http for evaluation
docker compose up -d --build         # migrations are applied on start
docker compose run --rm seed         # optional: load the demo project
```

Open http://localhost:3000. In production, put the app behind a TLS-terminating reverse proxy and leave `INSECURE_COOKIES` unset.

### Local development

Requires Node 20.9+ and PostgreSQL 14+.

```bash
cp .env.example .env                 # set DATABASE_URL and AUTH_SECRET
npm install
npx prisma migrate deploy
npm run db:seed                      # demo data
npm run dev
```

### Demo accounts (seed data)

All demo accounts use the password `SteelTrack@2026`:

`admin@`, `pm@`, `planner@`, `site@`, `site2@`, `qc@`, `client@` — all `@steeltrack.local`.

The seed creates a polypropylene plant structural package with six areas, about 2,150 marks (about 1,260 t), three contractors and six months of simulated history with a live QC queue, shipments, inspections, NCRs and punch items. It **deletes all existing data** first, so do not run it against a production database.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test          # unit tests; integration tests also run when DATABASE_URL is set
npm run build
```

The integration tests (`src/lib/services/progress-service.int.test.ts`) run against a real database. They cover sequencing, the QC hold flow, double-approval protection, reversal rules and concurrent bookings on the same member. CI (`.github/workflows/ci.yml`) runs all of the above against PostgreSQL 16.

## Architecture

```
src/
  app/(app)/…          Pages (React Server Components) + server actions per module
  app/api/…            Excel/PDF exports, health check
  lib/progress.ts      Pure progress maths (weights, sequencing, S-curve merge, SPI)
  lib/plan.ts          Baseline generation / CSV parsing
  lib/mto.ts           MTO header mapping, row validation, CSV parser
  lib/services/        Transactional booking + QC review (row-locked)
  lib/queries.ts       Aggregates in SQL (tonnage by stage/area/contractor, S-curve)
  lib/auth.ts, rbac.ts JWT session (httpOnly cookie), per-request user re-validation, permissions
prisma/schema.prisma   Data model; migrations in prisma/migrations
```

Security notes:

- Passwords are hashed with bcrypt.
- Sessions are signed HS256 JWTs in httpOnly, SameSite=Lax cookies with a 12-hour lifetime.
- Deactivated users lose access on their next request.
- Failed logins are rate-limited in memory, per instance. Use a shared store when running behind a load balancer.
- Security headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`) are set.
- All input is validated with zod on the server.

Health check: `GET /api/health`.
