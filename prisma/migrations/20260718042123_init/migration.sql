-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "branch" TEXT,
    "level" TEXT,
    "integrationState" TEXT,
    "bloomBusId" TEXT,
    "deletedAt" TEXT,
    "updatedAt" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentMembership" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "function" TEXT NOT NULL,
    "sectionId" TEXT,

    CONSTRAINT "DepartmentMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "branch" TEXT,
    "type" TEXT,
    "date" TEXT,
    "closed" BOOLEAN,
    "deletedAt" TEXT,
    "updatedAt" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "branch" TEXT,
    "reportType" TEXT,
    "departmentId" TEXT,
    "eventId" TEXT,
    "date" TEXT,
    "deletedAt" TEXT,
    "updatedAt" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "branch" TEXT,
    "actionType" TEXT,
    "entity" TEXT,
    "timestamp" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "branch" TEXT,
    "targetMemberId" TEXT,
    "read" BOOLEAN,
    "deletedAt" TEXT,
    "updatedAt" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ministry" (
    "id" TEXT NOT NULL,
    "branch" TEXT,
    "deletedAt" TEXT,
    "updatedAt" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "Ministry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "branch" TEXT,
    "type" TEXT,
    "ministryId" TEXT,
    "deletedAt" TEXT,
    "updatedAt" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT,
    "deletedAt" TEXT,
    "updatedAt" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "branch" TEXT,
    "scope" TEXT,
    "ministryId" TEXT,
    "deletedAt" TEXT,
    "updatedAt" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloomBus" (
    "id" TEXT NOT NULL,
    "deletedAt" TEXT,
    "updatedAt" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "BloomBus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" TEXT NOT NULL,
    "memberId" TEXT,
    "deletedAt" TEXT,
    "updatedAt" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationReport" (
    "id" TEXT NOT NULL,
    "memberId" TEXT,
    "deletedAt" TEXT,
    "updatedAt" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "IntegrationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormDefinition" (
    "id" TEXT NOT NULL,
    "deletedAt" TEXT,
    "updatedAt" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "FormDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delegation" (
    "id" TEXT NOT NULL,
    "deletedAt" TEXT,
    "updatedAt" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "Delegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAccount" (
    "id" TEXT NOT NULL,
    "deletedAt" TEXT,
    "updatedAt" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "AdminAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapabilityOverride" (
    "id" TEXT NOT NULL,
    "branch" TEXT,
    "deletedAt" TEXT,
    "updatedAt" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "CapabilityOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialAuthorization" (
    "id" TEXT NOT NULL,
    "branch" TEXT,
    "deletedAt" TEXT,
    "updatedAt" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "SpecialAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kv" (
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "Kv_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Credential" (
    "memberId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "pwdVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("memberId")
);

-- CreateTable
CREATE TABLE "Token" (
    "token" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" BIGINT NOT NULL,
    "usedAt" BIGINT,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "SyncOp" (
    "opId" TEXT NOT NULL,
    "appliedAt" TEXT NOT NULL,

    CONSTRAINT "SyncOp_pkey" PRIMARY KEY ("opId")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "receivedAt" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "signature" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" SERIAL NOT NULL,
    "dedupeKey" TEXT,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'simulated',
    "createdAt" TEXT NOT NULL,
    "sentAt" TEXT,
    "error" TEXT,

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Member_branch_idx" ON "Member"("branch");

-- CreateIndex
CREATE INDEX "Member_level_idx" ON "Member"("level");

-- CreateIndex
CREATE INDEX "Member_integrationState_idx" ON "Member"("integrationState");

-- CreateIndex
CREATE INDEX "Member_bloomBusId_idx" ON "Member"("bloomBusId");

-- CreateIndex
CREATE INDEX "Member_deletedAt_idx" ON "Member"("deletedAt");

-- CreateIndex
CREATE INDEX "DepartmentMembership_departmentId_idx" ON "DepartmentMembership"("departmentId");

-- CreateIndex
CREATE INDEX "DepartmentMembership_function_idx" ON "DepartmentMembership"("function");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentMembership_memberId_departmentId_key" ON "DepartmentMembership"("memberId", "departmentId");

-- CreateIndex
CREATE INDEX "Event_branch_idx" ON "Event"("branch");

-- CreateIndex
CREATE INDEX "Event_date_idx" ON "Event"("date");

-- CreateIndex
CREATE INDEX "Event_closed_idx" ON "Event"("closed");

-- CreateIndex
CREATE INDEX "Event_deletedAt_idx" ON "Event"("deletedAt");

-- CreateIndex
CREATE INDEX "Report_branch_idx" ON "Report"("branch");

-- CreateIndex
CREATE INDEX "Report_reportType_idx" ON "Report"("reportType");

-- CreateIndex
CREATE INDEX "Report_departmentId_idx" ON "Report"("departmentId");

-- CreateIndex
CREATE INDEX "Report_eventId_idx" ON "Report"("eventId");

-- CreateIndex
CREATE INDEX "Report_date_idx" ON "Report"("date");

-- CreateIndex
CREATE INDEX "Report_deletedAt_idx" ON "Report"("deletedAt");

-- CreateIndex
CREATE INDEX "Audit_branch_idx" ON "Audit"("branch");

-- CreateIndex
CREATE INDEX "Audit_actionType_idx" ON "Audit"("actionType");

-- CreateIndex
CREATE INDEX "Audit_entity_idx" ON "Audit"("entity");

-- CreateIndex
CREATE INDEX "Audit_timestamp_idx" ON "Audit"("timestamp");

-- CreateIndex
CREATE INDEX "Notification_branch_idx" ON "Notification"("branch");

-- CreateIndex
CREATE INDEX "Notification_targetMemberId_idx" ON "Notification"("targetMemberId");

-- CreateIndex
CREATE INDEX "Notification_deletedAt_idx" ON "Notification"("deletedAt");

-- CreateIndex
CREATE INDEX "Ministry_branch_idx" ON "Ministry"("branch");

-- CreateIndex
CREATE INDEX "Ministry_deletedAt_idx" ON "Ministry"("deletedAt");

-- CreateIndex
CREATE INDEX "Department_branch_idx" ON "Department"("branch");

-- CreateIndex
CREATE INDEX "Department_ministryId_idx" ON "Department"("ministryId");

-- CreateIndex
CREATE INDEX "Department_type_idx" ON "Department"("type");

-- CreateIndex
CREATE INDEX "Department_deletedAt_idx" ON "Department"("deletedAt");

-- CreateIndex
CREATE INDEX "Activity_departmentId_idx" ON "Activity"("departmentId");

-- CreateIndex
CREATE INDEX "Activity_deletedAt_idx" ON "Activity"("deletedAt");

-- CreateIndex
CREATE INDEX "Project_branch_idx" ON "Project"("branch");

-- CreateIndex
CREATE INDEX "Project_scope_idx" ON "Project"("scope");

-- CreateIndex
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");

-- CreateIndex
CREATE INDEX "BloomBus_deletedAt_idx" ON "BloomBus"("deletedAt");

-- CreateIndex
CREATE INDEX "Certification_memberId_idx" ON "Certification"("memberId");

-- CreateIndex
CREATE INDEX "Certification_deletedAt_idx" ON "Certification"("deletedAt");

-- CreateIndex
CREATE INDEX "IntegrationReport_memberId_idx" ON "IntegrationReport"("memberId");

-- CreateIndex
CREATE INDEX "IntegrationReport_deletedAt_idx" ON "IntegrationReport"("deletedAt");

-- CreateIndex
CREATE INDEX "FormDefinition_deletedAt_idx" ON "FormDefinition"("deletedAt");

-- CreateIndex
CREATE INDEX "Delegation_deletedAt_idx" ON "Delegation"("deletedAt");

-- CreateIndex
CREATE INDEX "AdminAccount_deletedAt_idx" ON "AdminAccount"("deletedAt");

-- CreateIndex
CREATE INDEX "CapabilityOverride_branch_idx" ON "CapabilityOverride"("branch");

-- CreateIndex
CREATE INDEX "CapabilityOverride_deletedAt_idx" ON "CapabilityOverride"("deletedAt");

-- CreateIndex
CREATE INDEX "SpecialAuthorization_branch_idx" ON "SpecialAuthorization"("branch");

-- CreateIndex
CREATE INDEX "SpecialAuthorization_deletedAt_idx" ON "SpecialAuthorization"("deletedAt");

-- CreateIndex
CREATE INDEX "Token_memberId_idx" ON "Token"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_signature_key" ON "WebhookEvent"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "Outbox_dedupeKey_key" ON "Outbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "Outbox_status_idx" ON "Outbox"("status");

-- AddForeignKey
ALTER TABLE "DepartmentMembership" ADD CONSTRAINT "DepartmentMembership_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
