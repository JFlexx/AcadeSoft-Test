-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "absenceNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "absenceNoticesEnabled" BOOLEAN NOT NULL DEFAULT false;
