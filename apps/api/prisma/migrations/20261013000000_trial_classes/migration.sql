-- CreateEnum
CREATE TYPE "TrialStatus" AS ENUM ('BOOKED', 'CONVERTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "trialClassesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "trial_classes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "TrialStatus" NOT NULL DEFAULT 'BOOKED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_classes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trial_classes_tenantId_createdAt_idx" ON "trial_classes"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "trial_classes_sessionId_studentId_key" ON "trial_classes"("sessionId", "studentId");

-- AddForeignKey
ALTER TABLE "trial_classes" ADD CONSTRAINT "trial_classes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_classes" ADD CONSTRAINT "trial_classes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_classes" ADD CONSTRAINT "trial_classes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

