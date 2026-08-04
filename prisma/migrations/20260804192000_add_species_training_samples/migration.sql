CREATE TABLE "Species" (
    "id" SERIAL NOT NULL,
    "scientificName" TEXT NOT NULL,
    "commonName" TEXT,
    "taxonomicGroup" TEXT NOT NULL,
    "family" TEXT,
    "orderName" TEXT,
    "source" TEXT,
    "conservationStatus" TEXT,
    "isTrainable" BOOLEAN NOT NULL DEFAULT true,
    "minImagesForTraining" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Species_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingSample" (
    "id" SERIAL NOT NULL,
    "detectionId" INTEGER NOT NULL,
    "speciesId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "cropImagePath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'trainable',
    "split" TEXT,
    "quality" TEXT,
    "reviewedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSample_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Detection" ADD COLUMN "validatedSpeciesId" INTEGER;

CREATE UNIQUE INDEX "Species_scientificName_key" ON "Species"("scientificName");
CREATE UNIQUE INDEX "TrainingSample_detectionId_key" ON "TrainingSample"("detectionId");
CREATE INDEX "Species_taxonomicGroup_idx" ON "Species"("taxonomicGroup");
CREATE INDEX "Species_isTrainable_idx" ON "Species"("isTrainable");
CREATE INDEX "TrainingSample_speciesId_idx" ON "TrainingSample"("speciesId");
CREATE INDEX "TrainingSample_status_idx" ON "TrainingSample"("status");
CREATE INDEX "TrainingSample_split_idx" ON "TrainingSample"("split");
CREATE INDEX "TrainingSample_reviewedById_idx" ON "TrainingSample"("reviewedById");
CREATE INDEX "Detection_validatedSpeciesId_idx" ON "Detection"("validatedSpeciesId");

ALTER TABLE "Detection" ADD CONSTRAINT "Detection_validatedSpeciesId_fkey" FOREIGN KEY ("validatedSpeciesId") REFERENCES "Species"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingSample" ADD CONSTRAINT "TrainingSample_detectionId_fkey" FOREIGN KEY ("detectionId") REFERENCES "Detection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingSample" ADD CONSTRAINT "TrainingSample_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrainingSample" ADD CONSTRAINT "TrainingSample_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
