CREATE TABLE "Individual" (
    "id" SERIAL NOT NULL,
    "species" TEXT NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Individual_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Detection" ADD COLUMN "individualId" INTEGER;
ALTER TABLE "Detection" ADD COLUMN "individualMatchStatus" TEXT;
ALTER TABLE "Detection" ADD COLUMN "individualMatchConfidence" DOUBLE PRECISION;
ALTER TABLE "Detection" ADD COLUMN "individualMatchBasis" TEXT;

CREATE INDEX "Individual_species_idx" ON "Individual"("species");
CREATE INDEX "Individual_createdAt_idx" ON "Individual"("createdAt");
CREATE INDEX "Detection_individualId_idx" ON "Detection"("individualId");
CREATE INDEX "Detection_species_capturedAt_idx" ON "Detection"("species", "capturedAt");

ALTER TABLE "Detection" ADD CONSTRAINT "Detection_individualId_fkey" FOREIGN KEY ("individualId") REFERENCES "Individual"("id") ON DELETE SET NULL ON UPDATE CASCADE;
