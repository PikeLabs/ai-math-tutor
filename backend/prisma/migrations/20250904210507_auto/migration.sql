-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('image_thumb', 'image_full', 'audio');

-- CreateTable
CREATE TABLE "SlideAsset" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "slideNumber" INTEGER NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "s3Key" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "durationMs" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "checksumMd5" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlideAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_slideasset_session_slide_kind" ON "SlideAsset"("sessionId", "slideNumber", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_asset_per_slide_kind" ON "SlideAsset"("sessionId", "slideNumber", "kind");

-- AddForeignKey
ALTER TABLE "SlideAsset" ADD CONSTRAINT "SlideAsset_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
