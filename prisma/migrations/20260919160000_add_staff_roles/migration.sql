-- AlterTable
ALTER TABLE "User" ADD COLUMN     "staffRoles" "Role"[] DEFAULT ARRAY[]::"Role"[];
