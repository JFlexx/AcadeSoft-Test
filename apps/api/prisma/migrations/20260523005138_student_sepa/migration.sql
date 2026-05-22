-- AlterTable
ALTER TABLE "students" ADD COLUMN     "iban" TEXT,
ADD COLUMN     "mandateDate" TIMESTAMP(3),
ADD COLUMN     "mandateReference" TEXT;
