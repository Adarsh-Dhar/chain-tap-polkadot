-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "assetId" INTEGER,
ADD COLUMN     "signerAddress" TEXT,
ADD COLUMN     "tokensPerOrder" INTEGER,
ADD COLUMN     "webhookUrl" TEXT;

-- CreateTable
CREATE TABLE "order_rewards" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "orderId" TEXT NOT NULL,
    "wallet" TEXT,
    "amount" TEXT,
    "assetId" INTEGER,
    "status" TEXT NOT NULL,
    "txHash" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_rewards_contractId_orderId_key" ON "order_rewards"("contractId", "orderId");

-- AddForeignKey
ALTER TABLE "order_rewards" ADD CONSTRAINT "order_rewards_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
