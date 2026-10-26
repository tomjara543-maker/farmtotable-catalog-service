import { Router } from "express";
import { z } from "zod";
import { AuthUser, requireUser, userOf } from "./auth";
import { prisma } from "./db";
import { publish } from "./events";
import { Product } from "./generated/prisma/client";
import { callService, HttpError, notFound, round2, today } from "./http";

const PRODUCER_URL = process.env.PRODUCER_SERVICE_URL;

const date = (field: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${field} debe ser una fecha YYYY-MM-DD`);

const productSchema = z.object({
  producerId: z.string().min(1),
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  category: z.string().trim().min(1, "La categoría es obligatoria"),
  basePrice: z.coerce.number().positive("basePrice debe ser mayor que 0"),
  requiresColdChain: z.boolean().default(false),
  seasonMonths: z.array(z.coerce.number()).default([]),
});

const batchSchema = z
  .object({
    harvestDate: date("harvestDate"),
    expiryEstimate: date("expiryEstimate"),
    quantityKg: z.coerce.number().positive("quantityKg debe ser mayor que 0"),
  })
  .refine((b) => b.expiryEstimate >= b.harvestDate, "La caducidad debe ser posterior a la cosecha");

const isInSeason = (months: number[]) => months.length === 0 || months.includes(new Date().getMonth() + 1);

async function availableKg(productIds: string[]) {
  const rows = await prisma.harvestBatch.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds }, quantityAvailable: { gt: 0 }, expiryEstimate: { gte: today() } },
    _sum: { quantityAvailable: true },
  });
  return new Map(rows.map((r) => [r.productId, round2(r._sum.quantityAvailable ?? 0)]));
}

async function toPublic(products: Product[]) {
  const kg = await availableKg(products.map((p) => p.id));
  return products.map(({ createdAt: _c, ...p }) => ({ ...p, availableKg: kg.get(p.id) ?? 0, inSeason: isInSeason(p.seasonMonths) }));
}

async function assertOwner(user: AuthUser, producerId: string) {
  const producer = await callService<{ ownerId: string }>(PRODUCER_URL, `/producers/${encodeURIComponent(producerId)}`);
  if (user.role !== "ADMIN" && producer.ownerId !== user.id) throw new HttpError(403, "Esta granja no es tuya");
}

async function findProduct(id: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw notFound("Producto");
  return product;
}

export function catalogRoutes() {
  const router = Router();

  router.get("/", async (req, res) => {
    const producerId = typeof req.query.producerId === "string" ? req.query.producerId : undefined;
    let list = await prisma.product.findMany({ where: { producerId }, orderBy: { createdAt: "asc" } });
    if (req.query.inSeason === "true") list = list.filter((p) => isInSeason(p.seasonMonths));
    res.json(await toPublic(list));
  });

  router.get("/:id", async (req, res) => {
    res.json((await toPublic([await findProduct(String(req.params.id))]))[0]);
  });

  router.post("/", requireUser("PRODUCER"), async (req, res) => {
    const data = productSchema.parse(req.body);
    await assertOwner(userOf(res), data.producerId);
    const basePrice = Math.round(data.basePrice);
    const product = await prisma.product.create({
      data: {
        ...data,
        basePrice,
        currentPrice: basePrice,
        seasonMonths: [...new Set(data.seasonMonths.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))],
      },
    });
    publish("product.created", {
      productId: product.id,
      producerId: product.producerId,
      name: product.name,
      category: product.category,
      basePrice,
      requiresColdChain: product.requiresColdChain,
    });
    res.status(201).json((await toPublic([product]))[0]);
  });

  router.get("/:id/availability", async (req, res) => {
    const product = await findProduct(String(req.params.id));
    const kg = await availableKg([product.id]);
    res.json({ productId: product.id, availableKg: kg.get(product.id) ?? 0, currentPrice: product.currentPrice });
  });

  router.get("/:id/batches", async (req, res) => {
    const batches = await prisma.harvestBatch.findMany({ where: { productId: String(req.params.id) }, orderBy: { harvestDate: "asc" } });
    res.json(
      batches.map(({ id, productId, harvestDate, quantityKg, expiryEstimate }) => ({ batchId: id, productId, harvestDate, quantityKg, expiryEstimate })),
    );
  });

  router.post("/:id/batches", requireUser("PRODUCER"), async (req, res) => {
    const product = await findProduct(String(req.params.id));
    await assertOwner(userOf(res), product.producerId);
    const data = batchSchema.parse(req.body);
    const batch = await prisma.harvestBatch.create({ data: { ...data, productId: product.id, quantityAvailable: data.quantityKg } });
    publish("product.available", {
      productId: product.id,
      producerId: product.producerId,
      name: product.name,
      basePrice: product.basePrice,
      batchId: batch.id,
      harvestDate: batch.harvestDate,
      quantityKg: batch.quantityKg,
      expiryEstimate: batch.expiryEstimate,
    });
    res.status(201).json({
      batchId: batch.id,
      productId: product.id,
      harvestDate: batch.harvestDate,
      quantityKg: batch.quantityKg,
      expiryEstimate: batch.expiryEstimate,
    });
  });

  return router;
}
