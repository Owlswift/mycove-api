-- Rename to reflect that this column now stores images OR video, not just images.
-- Uses RENAME rather than drop+add to preserve existing data.
ALTER TABLE "Project" RENAME COLUMN "imageBase64" TO "mediaBase64";
ALTER TABLE "ProjectReport" RENAME COLUMN "imageBase64" TO "mediaBase64";

-- Needed to reliably determine the most recently posted update per project.
ALTER TABLE "ProjectReport" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
