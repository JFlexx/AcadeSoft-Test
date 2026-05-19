/*
  Warnings:

  - Added the required column `tenantId` to the `payments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'PARTIAL';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "invoiceCounter" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "invoicePrefix" TEXT NOT NULL DEFAULT 'F';

-- CreateIndex
CREATE INDEX "invoices_tenantId_issueDate_idx" ON "invoices"("tenantId", "issueDate");

-- CreateIndex
CREATE INDEX "payments_tenantId_idx" ON "payments"("tenantId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
