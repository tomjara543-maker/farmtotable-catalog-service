import { idempotent, prisma } from "./db";
import { subscribe } from "./events";

interface Allocation {
  batchId: string;
  quantityKg: number;
}

async function adjust(allocations: Allocation[], sign: 1 | -1) {
  await prisma.$transaction(
    allocations.map((a) =>
      prisma.harvestBatch.updateMany({ where: { id: a.batchId }, data: { quantityAvailable: { increment: sign * a.quantityKg } } }),
    ),
  );
}

export async function registerConsumers() {
  await subscribe(
    "catalog-service",
    ["inventory.reserved", "inventory.released", "price.updated"],
    idempotent(async (event) => {
      if (event.eventType === "inventory.reserved") await adjust(event.data.allocations, -1);
      if (event.eventType === "inventory.released") await adjust(event.data.allocations, 1);
      if (event.eventType === "price.updated") {
        await prisma.product.updateMany({ where: { id: event.data.productId }, data: { currentPrice: event.data.to } });
      }
    }),
  );
}
