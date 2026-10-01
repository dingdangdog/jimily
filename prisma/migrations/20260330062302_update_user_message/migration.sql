-- AlterTable
ALTER TABLE "user_chat_messages" ADD COLUMN     "clientRequestId" VARCHAR(80),
ADD COLUMN     "usedApiModel" VARCHAR(100),
ADD COLUMN     "usedProviderId" VARCHAR(36),
ADD COLUMN     "usedProviderName" VARCHAR(100);
