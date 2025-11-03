-- CreateTable
CREATE TABLE "contracts" (
    "id" SERIAL NOT NULL,
    "phalaEndpoint" TEXT NOT NULL,
    "merchantName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);
