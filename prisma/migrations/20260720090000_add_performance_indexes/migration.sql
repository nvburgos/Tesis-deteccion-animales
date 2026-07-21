CREATE INDEX "Detection_batchJobId_idx" ON "Detection"("batchJobId");
CREATE INDEX "Detection_userId_idx" ON "Detection"("userId");
CREATE INDEX "Detection_species_idx" ON "Detection"("species");
CREATE INDEX "Detection_priority_idx" ON "Detection"("priority");
CREATE INDEX "Detection_createdAt_idx" ON "Detection"("createdAt");
CREATE INDEX "Detection_manualReviewedAt_idx" ON "Detection"("manualReviewedAt");
CREATE INDEX "Detection_cameraId_createdAt_idx" ON "Detection"("cameraId", "createdAt");
CREATE INDEX "Detection_cameraId_capturedAt_idx" ON "Detection"("cameraId", "capturedAt");
CREATE INDEX "Detection_batchJobId_species_idx" ON "Detection"("batchJobId", "species");

CREATE INDEX "BatchJob_status_idx" ON "BatchJob"("status");
CREATE INDEX "BatchJob_userId_idx" ON "BatchJob"("userId");
CREATE INDEX "BatchJob_createdAt_idx" ON "BatchJob"("createdAt");
CREATE INDEX "BatchJob_completedAt_idx" ON "BatchJob"("completedAt");
CREATE INDEX "BatchJob_cameraId_status_idx" ON "BatchJob"("cameraId", "status");