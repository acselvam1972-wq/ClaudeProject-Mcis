// Demo data: a process-plant steel package with ~5 months of simulated progress history.
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateSCurve } from "../src/lib/plan";

const prisma = new PrismaClient();
const DAY = 86_400_000;

// Deterministic PRNG so every seed produces identical data.
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260401);
const between = (a: number, b: number) => a + rnd() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const day = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d: Date, n: number) => day(new Date(d.getTime() + Math.round(n) * DAY));

const STAGES = [
  { code: "FAB", name: "Fabrication", weight: 20, qcHold: false },
  { code: "PAINT", name: "Blasting & Painting", weight: 10, qcHold: true },
  { code: "DISPATCH", name: "Dispatch from Shop", weight: 5, qcHold: false },
  { code: "RECEIPT", name: "Receipt at Site", weight: 5, qcHold: false },
  { code: "ERECT", name: "Erection", weight: 35, qcHold: false },
  { code: "BOLT", name: "Bolting & Torquing", weight: 10, qcHold: true },
  { code: "ALIGN", name: "Alignment & Plumbness", weight: 10, qcHold: true },
  { code: "FINAL", name: "Final Inspection & Touch-up", weight: 5, qcHold: true },
] as const;
// Days after the previous stage [min, max]
const STAGE_LAG: Record<string, [number, number]> = {
  FAB: [0, 0], PAINT: [5, 12], DISPATCH: [2, 7], RECEIPT: [1, 3], ERECT: [7, 35], BOLT: [3, 12], ALIGN: [2, 8], FINAL: [5, 15],
};

const AREAS = [
  { code: "PR-01", name: "Main Pipe Rack (Grid 1-24)", offset: 0, span: 270, bays: 36 },
  { code: "PR-02", name: "Interconnecting Pipe Rack", offset: 25, span: 290, bays: 20 },
  { code: "U-100", name: "Compressor House", offset: 15, span: 310, bays: 12 },
  { code: "U-200", name: "Fired Heater Structure", offset: 50, span: 300, bays: 10 },
  { code: "TS-01", name: "Technological Structure (Reactor)", offset: 35, span: 320, bays: 10 },
  { code: "SUB-01", name: "Substation & Cable Rack", offset: 90, span: 265, bays: 8 },
];

const CONTRACTORS = [
  { name: "Apex Structural Erectors", scope: "Pipe racks PR-01 / PR-02" },
  { name: "Meridian Heavy Lift", scope: "Compressor house, heater & reactor structures" },
  { name: "Coastal Steel Services", scope: "Substation, cable racks, stairs & handrails" },
];

const TYPES = [
  { type: "COLUMN", profiles: [["UC 305x305x97", 97], ["UC 254x254x89", 89], ["HEB 400", 155], ["HEB 300", 117]], len: [6000, 16000], perBay: 4, qty: [1, 1] },
  { type: "BEAM", profiles: [["UB 457x191x67", 67], ["UB 356x171x51", 51], ["IPE 400", 66.3], ["UB 533x210x92", 92]], len: [4000, 9000], perBay: 8, qty: [1, 2] },
  { type: "BRACING", profiles: [["L 150x150x12", 27.3], ["CHS 168.3x7.1", 28.2], ["L 100x100x10", 15]], len: [5000, 9000], perBay: 4, qty: [1, 2] },
  { type: "GIRT", profiles: [["C 200x75x23", 23.4], ["Z 200x2.5", 7.2]], len: [5000, 7000], perBay: 2, qty: [2, 6] },
  { type: "PLATFORM", profiles: [["PFC 230x90x32", 32.2], ["PFC 180x75x20", 20.3]], len: [2000, 6000], perBay: 1, qty: [1, 3] },
  { type: "GRATING", profiles: [["GRATING 30x5 (1000x6000)", 34.5]], len: [1000, 1000], perBay: 1, qty: [2, 8] },
  { type: "STAIR", profiles: [["STRINGER PFC 260", 350]], len: [1, 1], perBay: 0.3, qty: [1, 1] },
  { type: "HANDRAIL", profiles: [["HANDRAIL 42.4 CHS", 11]], len: [3000, 6000], perBay: 1, qty: [2, 6] },
  { type: "BASE PLATE", profiles: [["PL 40 (600x600)", 113]], len: [1, 1], perBay: 0, qty: [4, 4] },
] as const;

async function main() {
  const today = day(new Date());
  const projectStart = addDays(today, -182);
  const projectEnd = addDays(today, 183);

  console.log("Clearing existing data…");
  await prisma.auditLog.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  const hash = await bcrypt.hash("SteelTrack@2026", 10);
  const users: [string, string, Role][] = [
    ["admin@steeltrack.local", "System Administrator", "ADMIN"],
    ["pm@steeltrack.local", "Priya Raman (PM)", "PROJECT_MANAGER"],
    ["planner@steeltrack.local", "Arjun Mehta (Planner)", "PLANNER"],
    ["site@steeltrack.local", "Daniel Okafor (Site Engineer)", "SITE_ENGINEER"],
    ["site2@steeltrack.local", "Lena Novak (Site Engineer)", "SITE_ENGINEER"],
    ["qc@steeltrack.local", "Sara Haddad (QC Inspector)", "QC_INSPECTOR"],
    ["client@steeltrack.local", "Client Representative", "VIEWER"],
  ];
  const u: Record<string, string> = {};
  for (const [email, name, role] of users) {
    const created = await prisma.user.create({ data: { email, name, role, passwordHash: hash } });
    u[email.split("@")[0]] = created.id;
  }

  const project = await prisma.project.create({
    data: {
      code: "PP-2026-STR",
      name: "Polypropylene Plant Expansion — Structural Steel",
      client: "Gulf Petrochemicals Co.",
      location: "Jubail Industrial City",
      startDate: projectStart,
      endDate: projectEnd,
    },
  });

  const stages = await Promise.all(
    STAGES.map((s, i) => prisma.stage.create({ data: { ...s, sequence: i + 1, projectId: project.id } })),
  );
  const contractors = await Promise.all(
    CONTRACTORS.map((c) => prisma.contractor.create({ data: { ...c, projectId: project.id } })),
  );
  const contractorFor = (code: string) =>
    code.startsWith("PR") ? contractors[0] : code === "SUB-01" ? contractors[2] : contractors[1];

  console.log("Generating members and progress history…");
  const memberRows: {
    id: string; projectId: string; areaId: string; contractorId: string; markNo: string; drawingNo: string; revision: string;
    memberType: string; profile: string; grade: string; lengthMm: number | null; quantity: number; unitWeightKg: number;
  }[] = [];
  const entries: { memberId: string; stageId: string; quantity: number; workDate: Date; status: "APPROVED" | "PENDING_QC"; enteredById: string; reviewedById?: string; reviewedAt?: Date; createdAt: Date }[] = [];
  const memberStages: { memberId: string; stageId: string; qtyDone: number }[] = [];
  const stageDates = new Map<string, Map<string, Date>>(); // memberId -> stageCode -> date completed/pending
  let seq = 0;

  for (const a of AREAS) {
    const area = await prisma.area.create({ data: { projectId: project.id, code: a.code, name: a.name } });
    const areaStart = addDays(projectStart, a.offset);
    const contractor = contractorFor(a.code);

    // Area baseline (logistic S-curve over its window)
    const areaEnd = addDays(areaStart, a.span);
    await prisma.planPoint.createMany({
      data: generateSCurve(areaStart, areaEnd, 7).map((p) => ({ projectId: project.id, areaId: area.id, date: new Date(p.date), plannedPercent: p.pct })),
    });

    for (const t of TYPES) {
      const count = t.type === "BASE PLATE" ? Math.ceil(a.bays * 0.5) : Math.max(1, Math.round(a.bays * t.perBay * between(0.8, 1.3)));
      for (let n = 1; n <= count; n++) {
        const [profile, kgPerM] = pick<readonly [string, number]>(t.profiles);
        const len = t.len[0] === t.len[1] ? null : Math.round(between(t.len[0], t.len[1]) / 50) * 50;
        const unitWeightKg = Math.round((len ? (kgPerM * len) / 1000 : kgPerM) * 10) / 10;
        const qty = int(t.qty[0], t.qty[1]);
        const id = `m${(++seq).toString().padStart(5, "0")}`;
        const prefix = t.type === "BASE PLATE" ? "BP" : t.type.slice(0, 2);
        memberRows.push({
          id, projectId: project.id, areaId: area.id, contractorId: contractor.id,
          markNo: `${a.code}-${prefix}${n.toString().padStart(3, "0")}`,
          drawingNo: `${a.code}-GA-${(100 + Math.ceil(n / 12)).toString()}`,
          revision: pick(["0", "0", "0", "1", "2"]),
          memberType: t.type, profile, grade: pick(["S355JR", "S355JR", "S275JR"]), lengthMm: len, quantity: qty, unitWeightKg,
        });

        // Simulated timeline: structural sequence (columns first, then beams, bracing, secondary).
        const typeLag = { COLUMN: 0, "BASE PLATE": -5, BEAM: 10, BRACING: 18, GIRT: 30, PLATFORM: 35, GRATING: 45, STAIR: 45, HANDRAIL: 55 }[t.type] ?? 0;
        let d = addDays(areaStart, 7 + typeLag + (n / count) * a.span * 0.78 + between(-6, 10));
        const dates = new Map<string, Date>();
        for (const s of stages) {
          const [lo, hi] = STAGE_LAG[s.code];
          d = addDays(d, between(lo, hi));
          if (d > today) break;
          const recent = today.getTime() - d.getTime() < 4 * DAY;
          const pending = s.qcHold && recent;
          entries.push({
            memberId: id, stageId: s.id, quantity: qty, workDate: d,
            status: pending ? "PENDING_QC" : "APPROVED",
            enteredById: rnd() > 0.5 ? u.site : u.site2,
            ...(s.qcHold && !pending ? { reviewedById: u.qc, reviewedAt: addDays(d, 1) } : {}),
            createdAt: addDays(d, 0.5),
          });
          dates.set(s.code, d);
          if (pending) break;
          memberStages.push({ memberId: id, stageId: s.id, qtyDone: qty });
        }
        stageDates.set(id, dates);
      }
    }
  }

  await prisma.member.createMany({ data: memberRows });
  for (let i = 0; i < entries.length; i += 5000) await prisma.progressEntry.createMany({ data: entries.slice(i, i + 5000) });
  for (let i = 0; i < memberStages.length; i += 5000) await prisma.memberStage.createMany({ data: memberStages.slice(i, i + 5000) });

  // Project-level baseline
  await prisma.planPoint.createMany({
    data: generateSCurve(projectStart, projectEnd, 7).map((p) => ({ projectId: project.id, areaId: null, date: new Date(p.date), plannedPercent: p.pct })),
  });

  console.log("Generating shipments…");
  const byDispatch = new Map<string, typeof memberRows>();
  for (const m of memberRows) {
    const d = stageDates.get(m.id)?.get("DISPATCH");
    if (!d) continue;
    // One truckload per area per 4-day window, dated at the window start.
    const bucket = new Date(Math.floor(d.getTime() / (4 * DAY)) * 4 * DAY);
    const key = `${m.areaId}|${bucket.toISOString().slice(0, 10)}`;
    byDispatch.set(key, [...(byDispatch.get(key) ?? []), m]);
  }
  let dn = 0;
  for (const [, ms] of [...byDispatch.entries()].sort((x, y) => x[0].split("|")[1].localeCompare(y[0].split("|")[1]))) {
    const dispatchDate = new Date(Math.min(...ms.map((m) => stageDates.get(m.id)!.get("DISPATCH")!.getTime())));
    const receiptDates = ms.map((m) => stageDates.get(m.id)?.get("RECEIPT")).filter(Boolean) as Date[];
    const received = receiptDates.length === ms.length;
    const receivedDate = received ? new Date(Math.max(...receiptDates.map((x) => x.getTime()))) : null;
    const areaCode = ms[0].markNo.split("-").slice(0, 2).join("-");
    await prisma.shipment.create({
      data: {
        projectId: project.id,
        number: `DN-${(++dn).toString().padStart(4, "0")}`,
        vehicleNo: `TRL-${int(1000, 9999)}`,
        transporter: pick(["Al-Rashid Transport", "Eastern Haulage", "Gulf Logistics"]),
        dispatchDate,
        receivedDate,
        laydownArea: received ? `LD-${areaCode}` : null,
        status: received ? "RECEIVED" : "IN_TRANSIT",
        items: { create: ms.map((m) => ({ memberId: m.id, quantity: m.quantity, qtyReceived: received ? m.quantity : null })) },
      },
    });
  }

  console.log("Generating QA/QC records…");
  const erectedMembers = memberRows.filter((m) => stageDates.get(m.id)?.has("BOLT"));
  const inspections = [];
  for (const m of erectedMembers.filter((x) => ["COLUMN", "BEAM", "BRACING"].includes(x.memberType)).slice(0, 400)) {
    if (rnd() > 0.55) continue;
    const spec = pick<[string, number]>([["M20", 330], ["M24", 570], ["M30", 1130]]);
    const fail = rnd() < 0.06;
    const actual = Math.round(spec[1] * (fail ? between(0.75, 0.92) : between(1.0, 1.08)));
    inspections.push({
      projectId: project.id, memberId: m.id, type: "BOLT_TORQUE", reference: `ITP-STR-007`,
      result: fail ? ("FAILED" as const) : ("PASSED" as const), inspectedAt: stageDates.get(m.id)!.get("BOLT")!, inspectorId: u.qc,
      boltSize: spec[0], specifiedTorqueNm: spec[1], actualTorqueNm: actual, boltCount: int(4, 16),
      remarks: fail ? "Under-torqued bolts found; re-torque and re-inspect." : null,
    });
  }
  for (const m of memberRows.filter((x) => x.memberType === "COLUMN" && stageDates.get(x.id)?.has("ALIGN"))) {
    const tol = Math.round(Math.min(25, (m.lengthMm ?? 10000) / 600) * 10) / 10;
    const measured = Math.round(between(0.2, 1.1) * tol * 10) / 10;
    inspections.push({
      projectId: project.id, memberId: m.id, type: "VERTICALITY", reference: "ITP-STR-009",
      result: measured > tol ? ("FAILED" as const) : ("PASSED" as const), inspectedAt: stageDates.get(m.id)!.get("ALIGN")!, inspectorId: u.qc,
      toleranceMm: tol, measuredMm: measured, remarks: measured > tol ? "Out of plumb — shim and realign." : null,
    });
  }
  for (const m of memberRows.filter((x) => stageDates.get(x.id)?.has("PAINT")).slice(0, 120)) {
    if (rnd() > 0.4) continue;
    inspections.push({
      projectId: project.id, memberId: m.id, type: "PAINT_DFT", reference: "ITP-PNT-003", result: "PASSED" as const,
      inspectedAt: stageDates.get(m.id)!.get("PAINT")!, inspectorId: u.qc, remarks: `Avg DFT ${int(245, 310)} µm (spec 240 µm min)`,
    });
  }
  await prisma.inspection.createMany({ data: inspections });

  const areas = await prisma.area.findMany({ where: { projectId: project.id } });
  const ncrTemplates = [
    ["Bolt holes misaligned at splice", "Slotted holes required at column splice; holes offset 4 mm from drawing.", "MAJOR", "Repair"],
    ["Paint damage during transport", "Coating damaged on flanges due to improper lashing.", "MINOR", "Rework"],
    ["Wrong profile supplied", "UB 356x171x45 supplied instead of UB 356x171x51.", "CRITICAL", "Reject"],
    ["Base plate grout voids", "Voids observed under base plate after grouting.", "MAJOR", "Repair"],
    ["Column out of plumb", "Verticality deviation exceeds H/600 tolerance.", "MAJOR", "Rework"],
    ["Missing shear studs", "Shear studs missing on top flange of beam.", "MINOR", "Repair"],
    ["Weld undercut", "Undercut > 0.5 mm on fillet weld at gusset.", "MINOR", "Repair"],
    ["Anchor bolt projection short", "Anchor bolt projection insufficient for double nut.", "MAJOR", "Use-as-is"],
    ["Bracing gusset cracked", "Crack observed at gusset plate corner after erection.", "CRITICAL", "Reject"],
    ["DFT below specification", "Topcoat DFT measured 180 µm vs 240 µm required.", "MINOR", "Rework"],
    ["Grating clips not installed", "Grating fixing clips missing at platform EL+12.500.", "MINOR", "Repair"],
    ["Damaged handrail post", "Handrail post bent during lifting.", "MINOR", "Rework"],
  ] as const;
  for (const [i, [title, description, severity, disposition]] of ncrTemplates.entries()) {
    const raised = addDays(today, -int(3, 120));
    const status = i < 5 ? "CLOSED" : i < 8 ? "UNDER_REVIEW" : "OPEN";
    const a = pick(areas);
    const m = pick(memberRows.filter((x) => x.areaId === a.id));
    await prisma.ncr.create({
      data: {
        projectId: project.id, number: `NCR-${(i + 1).toString().padStart(3, "0")}`, title, description,
        severity, status, disposition, areaId: a.id, memberId: m.id, raisedById: u.qc, raisedAt: raised,
        dueDate: addDays(raised, 14), closedAt: status === "CLOSED" ? addDays(raised, int(3, 14)) : null,
      },
    });
  }
  const punchTexts = [
    "Touch-up paint at bolted connections", "Install missing grating clips", "Tighten handrail splice bolts",
    "Remove temporary lifting lugs", "Grind sharp edges on stair treads", "Install toe plate at platform edge",
    "Seal gap at column cap plate", "Replace damaged bolt washers", "Clean welding spatter from beam web",
    "Fix missing earthing boss", "Paint touch-up on damaged bracing", "Re-torque base plate nuts",
  ];
  for (let i = 0; i < 30; i++) {
    const a = pick(areas);
    const raised = addDays(today, -int(1, 60));
    const closed = rnd() < 0.45;
    await prisma.punchItem.create({
      data: {
        projectId: project.id, number: `PL-${(i + 1).toString().padStart(3, "0")}`, description: `${pick(punchTexts)} — ${a.code}`,
        category: pick(["A", "B", "B", "C", "C"] as const), status: closed ? "CLOSED" : "OPEN", areaId: a.id,
        contractorId: contractorFor(a.code).id, raisedById: pick([u.qc, u.site, u.pm]), raisedAt: raised,
        dueDate: addDays(raised, int(7, 21)), closedAt: closed ? addDays(raised, int(1, 10)) : null,
      },
    });
  }

  await prisma.auditLog.create({ data: { userId: u.admin, projectId: project.id, action: "SEED", entity: "Project", entityId: project.id, details: { members: memberRows.length, entries: entries.length } } });
  const kg = memberRows.reduce((s, m) => s + m.quantity * m.unitWeightKg, 0);
  console.log(`Seeded ${memberRows.length} members (${(kg / 1000).toFixed(1)} t), ${entries.length} progress entries, ${dn} shipments, ${inspections.length} inspections.`);
  console.log("Login with any of:", users.map((x) => x[0]).join(", "), "— password: SteelTrack@2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
