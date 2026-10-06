-- AlterEnum
ALTER TYPE "EnrollmentStatus" ADD VALUE 'WAITLIST';

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "spotOfferedAt" TIMESTAMP(3);
