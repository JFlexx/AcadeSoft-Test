-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('ORIGINAL', 'RECTIFICATIVA');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "rectifiesId" TEXT,
ADD COLUMN     "type" "InvoiceType" NOT NULL DEFAULT 'ORIGINAL';

-- CreateIndex
CREATE INDEX "invoices_rectifiesId_idx" ON "invoices"("rectifiesId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_rectifiesId_fkey" FOREIGN KEY ("rectifiesId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
