-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "autoBillingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN "autoBillingDay" INTEGER NOT NULL DEFAULT 1;
