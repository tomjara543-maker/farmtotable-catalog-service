-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "producer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "base_price" INTEGER NOT NULL,
    "current_price" INTEGER NOT NULL,
    "requires_cold_chain" BOOLEAN NOT NULL DEFAULT false,
    "season_months" INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_batches" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "harvest_date" TEXT NOT NULL,
    "quantity_kg" DOUBLE PRECISION NOT NULL,
    "quantity_available" DOUBLE PRECISION NOT NULL,
    "expiry_estimate" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harvest_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE INDEX "products_producer_id_idx" ON "products"("producer_id");

-- CreateIndex
CREATE INDEX "harvest_batches_product_id_expiry_estimate_idx" ON "harvest_batches"("product_id", "expiry_estimate");

-- AddForeignKey
ALTER TABLE "harvest_batches" ADD CONSTRAINT "harvest_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
