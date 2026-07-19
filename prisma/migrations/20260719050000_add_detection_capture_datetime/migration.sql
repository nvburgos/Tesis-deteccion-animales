ALTER TABLE "Detection" ADD COLUMN "capturedAt" TIMESTAMP(3);
ALTER TABLE "Detection" ADD COLUMN "captureDateSource" TEXT;
CREATE INDEX "Detection_capturedAt_idx" ON "Detection"("capturedAt");
