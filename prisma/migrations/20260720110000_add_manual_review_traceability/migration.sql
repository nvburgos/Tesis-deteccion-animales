ALTER TABLE "Detection"
  ADD COLUMN "manualReviewStatus" TEXT,
  ADD COLUMN "reviewedById" INTEGER,
  ADD COLUMN "manualOriginalSpecies" TEXT,
  ADD COLUMN "manualCorrectedSpecies" TEXT,
  ADD COLUMN "reviewVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Detection"
  ADD CONSTRAINT "Detection_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Detection_manualReviewStatus_idx" ON "Detection"("manualReviewStatus");
CREATE INDEX "Detection_reviewedById_idx" ON "Detection"("reviewedById");