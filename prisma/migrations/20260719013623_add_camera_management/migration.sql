-- AlterTable
ALTER TABLE "BatchJob" ADD COLUMN     "cameraId" INTEGER;

-- AlterTable
ALTER TABLE "Detection" ADD COLUMN     "cameraId" INTEGER;

-- CreateTable
CREATE TABLE "Camera" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Camera_code_key" ON "Camera"("code");

-- CreateIndex
CREATE INDEX "BatchJob_cameraId_idx" ON "BatchJob"("cameraId");

-- CreateIndex
CREATE INDEX "Detection_cameraId_idx" ON "Detection"("cameraId");

-- AddForeignKey
ALTER TABLE "Detection" ADD CONSTRAINT "Detection_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchJob" ADD CONSTRAINT "BatchJob_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE SET NULL ON UPDATE CASCADE;
