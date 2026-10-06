-- CreateEnum
CREATE TYPE "RemittanceStatus" AS ENUM ('SENT', 'COLLECTED');

-- CreateEnum
CREATE TYPE "RemittanceItemStatus" AS ENUM ('SENT', 'COLLECTED', 'RETURNED');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'DIRECT_DEBIT';

-- CreateTable
CREATE TABLE "sepa_remittances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "collectionDate" DATE NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "status" "RemittanceStatus" NOT NULL DEFAULT 'SENT',
    "collectedAt" TIMESTAMP(3),
    "xml" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sepa_remittances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sepa_remittance_items" (
    "id" TEXT NOT NULL,
    "remittanceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "RemittanceItemStatus" NOT NULL DEFAULT 'SENT',
    "paymentId" TEXT,
    "returnReason" TEXT,
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sepa_remittance_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sepa_remittances_messageId_key" ON "sepa_remittances"("messageId");

-- CreateIndex
CREATE INDEX "sepa_remittances_tenantId_createdAt_idx" ON "sepa_remittances"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "sepa_remittance_items_remittanceId_idx" ON "sepa_remittance_items"("remittanceId");

-- CreateIndex
CREATE INDEX "sepa_remittance_items_invoiceId_idx" ON "sepa_remittance_items"("invoiceId");

-- AddForeignKey
ALTER TABLE "sepa_remittances" ADD CONSTRAINT "sepa_remittances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sepa_remittance_items" ADD CONSTRAINT "sepa_remittance_items_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "sepa_remittances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sepa_remittance_items" ADD CONSTRAINT "sepa_remittance_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sepa_remittance_items" ADD CONSTRAINT "sepa_remittance_items_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

