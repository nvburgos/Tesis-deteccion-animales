ALTER TABLE "User" ADD COLUMN "phoneNumber" TEXT;
ALTER TABLE "User" ADD COLUMN "whatsappVerifiedAt" TIMESTAMP(3);

CREATE TABLE "WhatsAppOtp" (
  "id" SERIAL NOT NULL,
  "email" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" INTEGER,

  CONSTRAINT "WhatsAppOtp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "User_phoneNumber_idx" ON "User"("phoneNumber");
CREATE INDEX "WhatsAppOtp_email_idx" ON "WhatsAppOtp"("email");
CREATE INDEX "WhatsAppOtp_phoneNumber_idx" ON "WhatsAppOtp"("phoneNumber");
CREATE INDEX "WhatsAppOtp_expiresAt_idx" ON "WhatsAppOtp"("expiresAt");

ALTER TABLE "WhatsAppOtp" ADD CONSTRAINT "WhatsAppOtp_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
