/*
  Warnings:

  - You are about to drop the column `payType` on the `user_fixed_flows` table. All the data in the column will be lost.
  - You are about to drop the column `payType` on the `user_flows` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "user_fixed_flows" DROP COLUMN "payType";

-- AlterTable
ALTER TABLE "user_flows" DROP COLUMN "payType";
