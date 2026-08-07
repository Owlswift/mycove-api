-- CreateTable
CREATE TABLE "DuesSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "monthlyAmount" INTEGER NOT NULL DEFAULT 45000,

    CONSTRAINT "DuesSettings_pkey" PRIMARY KEY ("id")
);
