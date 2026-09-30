-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PROJECT_MANAGER', 'PLANNER', 'SITE_ENGINEER', 'QC_INSPECTOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('APPROVED', 'PENDING_QC', 'REJECTED');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "NcrStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'CLOSED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PunchCategory" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "PunchStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('IN_TRANSIT', 'RECEIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client" TEXT,
    "location" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "qcHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "contractorId" TEXT,
    "markNo" TEXT NOT NULL,
    "drawingNo" TEXT,
    "revision" TEXT,
    "memberType" TEXT NOT NULL,
    "profile" TEXT,
    "grade" TEXT,
    "lengthMm" DOUBLE PRECISION,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitWeightKg" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberStage" (
    "memberId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "qtyDone" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberStage_pkey" PRIMARY KEY ("memberId","stageId")
);

-- CreateTable
CREATE TABLE "ProgressEntry" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "workDate" DATE NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'APPROVED',
    "remarks" TEXT,
    "enteredById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanPoint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "areaId" TEXT,
    "date" DATE NOT NULL,
    "plannedPercent" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PlanPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "memberId" TEXT,
    "type" TEXT NOT NULL,
    "reference" TEXT,
    "result" "InspectionResult" NOT NULL DEFAULT 'PENDING',
    "inspectedAt" TIMESTAMP(3),
    "inspectorId" TEXT,
    "remarks" TEXT,
    "boltSize" TEXT,
    "specifiedTorqueNm" DOUBLE PRECISION,
    "actualTorqueNm" DOUBLE PRECISION,
    "boltCount" INTEGER,
    "toleranceMm" DOUBLE PRECISION,
    "measuredMm" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ncr" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'MINOR',
    "status" "NcrStatus" NOT NULL DEFAULT 'OPEN',
    "areaId" TEXT,
    "memberId" TEXT,
    "disposition" TEXT,
    "raisedById" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Ncr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PunchItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "PunchCategory" NOT NULL DEFAULT 'B',
    "status" "PunchStatus" NOT NULL DEFAULT 'OPEN',
    "areaId" TEXT,
    "memberId" TEXT,
    "contractorId" TEXT,
    "raisedById" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "PunchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vehicleNo" TEXT,
    "transporter" TEXT,
    "dispatchDate" DATE NOT NULL,
    "receivedDate" DATE,
    "laydownArea" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentItem" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "qtyReceived" INTEGER,
    "damaged" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Area_projectId_code_key" ON "Area"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_projectId_name_key" ON "Contractor"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_projectId_code_key" ON "Stage"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_projectId_sequence_key" ON "Stage"("projectId", "sequence");

-- CreateIndex
CREATE INDEX "Member_projectId_areaId_idx" ON "Member"("projectId", "areaId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_projectId_markNo_key" ON "Member"("projectId", "markNo");

-- CreateIndex
CREATE INDEX "ProgressEntry_stageId_status_idx" ON "ProgressEntry"("stageId", "status");

-- CreateIndex
CREATE INDEX "ProgressEntry_workDate_idx" ON "ProgressEntry"("workDate");

-- CreateIndex
CREATE INDEX "PlanPoint_projectId_date_idx" ON "PlanPoint"("projectId", "date");

-- CreateIndex
CREATE INDEX "Inspection_projectId_type_idx" ON "Inspection"("projectId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Ncr_projectId_number_key" ON "Ncr"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PunchItem_projectId_number_key" ON "PunchItem"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_projectId_number_key" ON "Shipment"("projectId", "number");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberStage" ADD CONSTRAINT "MemberStage_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberStage" ADD CONSTRAINT "MemberStage_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPoint" ADD CONSTRAINT "PlanPoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPoint" ADD CONSTRAINT "PlanPoint_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
