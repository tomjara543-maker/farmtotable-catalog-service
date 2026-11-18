import assert from "node:assert/strict";
import { test } from "node:test";
import { batchSchema, isInSeason, normalizeSeasonMonths } from "../src/routes";

test("isInSeason y normalizeSeasonMonths manejan la temporada de cosecha", () => {
  assert.equal(isInSeason([], 7), true);
  assert.equal(isInSeason([11, 12, 1], 12), true);
  assert.equal(isInSeason([11, 12, 1], 6), false);

  assert.deepEqual(normalizeSeasonMonths([3, 3, 0, 13, 4.5, 12]), [3, 12]);
});

test("batchSchema valida fechas YYYY-MM-DD, cantidad positiva y caducidad posterior a la cosecha", () => {
  const ok = batchSchema.parse({ harvestDate: "2026-11-10", expiryEstimate: "2026-11-20", quantityKg: "12.5" });
  assert.equal(ok.quantityKg, 12.5);

  const expiredBeforeHarvest = batchSchema.safeParse({ harvestDate: "2026-11-10", expiryEstimate: "2026-11-01", quantityKg: 5 });
  assert.equal(expiredBeforeHarvest.success, false);
  assert.match(expiredBeforeHarvest.error!.issues[0].message, /posterior a la cosecha/);

  const badInput = batchSchema.safeParse({ harvestDate: "10/11/2026", expiryEstimate: "2026-11-20", quantityKg: 0 });
  assert.equal(badInput.success, false);
  assert.deepEqual(badInput.error!.issues.map((i) => i.path[0]).sort(), ["harvestDate", "quantityKg"]);
});
