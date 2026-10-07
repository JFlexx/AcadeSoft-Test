-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_studentId_fkey";

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "erasedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

