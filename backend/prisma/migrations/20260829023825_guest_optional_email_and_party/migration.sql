-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "companions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "department" VARCHAR(120),
ADD COLUMN     "party_size" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "email" DROP NOT NULL;
