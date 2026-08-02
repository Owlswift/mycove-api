-- CreateEnum
CREATE TYPE "SpotlightCategory" AS ENUM ('PERSON', 'BUSINESS');

-- CreateTable
CREATE TABLE "ProjectPledge" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Spotlight" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SpotlightCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "imageBase64" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Spotlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectPledge_projectId_idx" ON "ProjectPledge"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectPledge" ADD CONSTRAINT "ProjectPledge_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPledge" ADD CONSTRAINT "ProjectPledge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
