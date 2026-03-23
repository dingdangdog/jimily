/*
  Warnings:

  - You are about to drop the column `accountType` on the `user_fund_accounts` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "user_fund_accounts_userId_accountType_idx";

-- AlterTable
ALTER TABLE "user_fund_accounts" DROP COLUMN "accountType";
