-- CreateTable
CREATE TABLE "MobileRefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "MobileRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MobileRefreshToken_userId_idx" ON "MobileRefreshToken"("userId");

-- CreateIndex
CREATE INDEX "MobileRefreshToken_familyId_idx" ON "MobileRefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "MobileRefreshToken_expiresAt_idx" ON "MobileRefreshToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "MobileRefreshToken" ADD CONSTRAINT "MobileRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
