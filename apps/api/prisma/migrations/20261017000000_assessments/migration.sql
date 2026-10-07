-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_results" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" DECIMAL(4,2),
    "comment" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessments_groupId_date_idx" ON "assessments"("groupId", "date");

-- CreateIndex
CREATE INDEX "assessment_results_studentId_idx" ON "assessment_results"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_results_assessmentId_studentId_key" ON "assessment_results"("assessmentId", "studentId");

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

