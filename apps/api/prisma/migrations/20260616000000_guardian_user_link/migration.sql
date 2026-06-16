-- AlterTable
ALTER TABLE "guardians" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "guardians_userId_idx" ON "guardians"("userId");

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
