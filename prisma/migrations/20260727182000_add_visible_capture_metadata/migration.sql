ALTER TABLE "Detection" ADD COLUMN "cameraTrapCode" TEXT;
ALTER TABLE "Detection" ADD COLUMN "temperatureCelsius" DOUBLE PRECISION;
ALTER TABLE "Detection" ADD COLUMN "temperatureFahrenheit" DOUBLE PRECISION;
ALTER TABLE "Detection" ADD COLUMN "visibleMetadataText" TEXT;

CREATE INDEX "Detection_cameraTrapCode_idx" ON "Detection"("cameraTrapCode");
