-- SSLCommerz payments: a fixed-term subscription source and the payment attempt table. Additive.

ALTER TYPE "SubscriptionSource" ADD VALUE 'GATEWAY';

CREATE TABLE "payment_gateway_transactions" (
    "id" UUID NOT NULL,
    "gateway" TEXT NOT NULL,
    "tranId" TEXT NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID,
    "planKey" TEXT NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "environment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INITIATED',
    "reason" TEXT,
    "sessionKey" TEXT,
    "valId" TEXT,
    "bankTranId" TEXT,
    "paymentMethod" TEXT,
    "gatewayResult" JSONB,
    "invoiceId" UUID,
    "validatedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_gateway_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_gateway_transactions_tranId_key" ON "payment_gateway_transactions"("tranId");
CREATE INDEX "payment_gateway_transactions_workspaceId_createdAt_idx" ON "payment_gateway_transactions"("workspaceId", "createdAt" DESC);
CREATE INDEX "payment_gateway_transactions_status_createdAt_idx" ON "payment_gateway_transactions"("status", "createdAt" DESC);
