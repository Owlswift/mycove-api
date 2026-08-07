-- AlterTable
ALTER TABLE "Levy" ADD COLUMN     "year" INTEGER NOT NULL DEFAULT 2026;

-- CreateIndex
CREATE INDEX "Levy_year_idx" ON "Levy"("year");
