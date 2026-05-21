-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "monthlyFeeOverride" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "monthlyFee" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "billingPeriod" TEXT,
ADD COLUMN     "enrollmentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_enrollmentId_billingPeriod_key" ON "invoices"("enrollmentId", "billingPeriod");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
