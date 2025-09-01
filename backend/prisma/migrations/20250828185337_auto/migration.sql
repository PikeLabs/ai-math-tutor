/*
  Warnings:

  - Made the column `status` on table `Session` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'created';

-- CreateIndex
CREATE INDEX "idx_session_createdAt" ON "Session"("createdAt");
