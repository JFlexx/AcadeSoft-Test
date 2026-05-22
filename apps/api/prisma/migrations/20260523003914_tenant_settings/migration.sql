-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "sepaCreditorId" TEXT,
ADD COLUMN     "taxId" TEXT;
