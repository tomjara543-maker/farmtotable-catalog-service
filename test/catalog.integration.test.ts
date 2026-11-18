import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { as, request, Running, startApp, startStub } from "./helpers";

let api: Running;
let producers: Awaited<ReturnType<typeof startStub>>;

const newProduct = { producerId: "granja-1", name: "Mora", category: "Frutas", basePrice: 8000 };

before(async () => {
  producers = await startStub({
    "GET /producers/granja-1": () => ({ body: { id: "granja-1", ownerId: "productor-dueño" } }),
  });
  process.env.PRODUCER_SERVICE_URL = producers.url;
  const { createApp } = await import("../src/app");
  api = await startApp(createApp());
});

after(async () => {
  await api.close();
  await producers.close();
});

test("POST /products verifica en producer-service que la granja sea del productor", async () => {
  const res = await request(api.url, "/products", { method: "POST", headers: as("otro-productor", "PRODUCER"), body: newProduct });

  assert.equal(res.status, 403);
  assert.equal(res.body.error, "Esta granja no es tuya");
  assert.equal(producers.calls.length, 1);
  assert.equal(producers.calls[0].url, "/producers/granja-1");
});

test("POST /products rechaza compradores y datos inválidos sin consultar producer-service", async () => {
  const calls = producers.calls.length;

  const buyer = await request(api.url, "/products", { method: "POST", headers: as("b-1", "BUYER"), body: newProduct });
  assert.equal(buyer.status, 403);

  const invalid = await request(api.url, "/products", {
    method: "POST",
    headers: as("productor-dueño", "PRODUCER"),
    body: { ...newProduct, name: "", basePrice: -5 },
  });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /El nombre es obligatorio/);
  assert.match(invalid.body.error, /basePrice debe ser mayor que 0/);
  assert.equal(producers.calls.length, calls);
});
