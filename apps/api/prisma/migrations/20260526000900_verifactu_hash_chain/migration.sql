-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "hash" TEXT,
ADD COLUMN     "hashedAt" TIMESTAMP(3),
ADD COLUMN     "previousHash" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "lastInvoiceHash" TEXT;
