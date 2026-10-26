# catalog-service

Productos y cosechas (lotes); disponibilidad para el comprador. Parte de **FarmToTable** (marketplace agrícola con microservicios orientados a eventos).

Estado: **Implementado** con PostgreSQL (Prisma) y RabbitMQ. Probado de punta a punta a través del API Gateway.

- Puerto local: `4002` · Ruta pública en el API Gateway: `/api/products`
- Base de datos propia (`DATABASE_URL`), nunca compartida con otro servicio
- Eventos por RabbitMQ (exchange topic `farmtotable.events`, ver `src/events.ts`)

## Contrato REST

Es lo que ya consume el frontend (y lo que simula su modo demo en `src/lib/mock/server.ts` del repo del frontend).
El API Gateway valida el JWT y reenvía `x-user-id` / `x-user-role`; usa `requireUser()` de `src/auth.ts`.

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/products?producerId=&inSeason=` | público | Productos con `currentPrice`, `availableKg`, `inSeason` |
| `GET` | `/products/:id` | público | Detalle |
| `POST` | `/products` | PRODUCER dueño de producerId | `{ producerId, name, category, basePrice, requiresColdChain, seasonMonths[] }` |
| `GET` | `/products/:id/availability` | público | `{ productId, availableKg, currentPrice }` (consulta síncrona antes del carrito) |
| `GET` | `/products/:id/batches` | público | Lotes del producto |
| `POST` | `/products/:id/batches` | PRODUCER dueño | `{ harvestDate, quantityKg, expiryEstimate }` → publica `product.available` |

Errores: `{ "error": "mensaje" }` con 400 (validación zod), 401, 403, 404, 409 (estado inválido) o 422 (regla de negocio).

## Eventos

Publica:
- `product.created` (pricing registra el precio inicial)
- `product.available` (lleva el lote completo)

Consume:
- `inventory.reserved` / `inventory.released` → actualizar availableKg
- `price.updated` → actualizar currentPrice

Todo consumidor debe envolverse en `idempotent()` (`src/db.ts`).

## Modelo de datos (Prisma)

- `Product` (id, producerId, name, category, basePrice, currentPrice, requiresColdChain, seasonMonths int[])
- `HarvestBatch` (id, productId, harvestDate, quantityKg, expiryEstimate)
- Valida el productor por REST contra producer-service (`PRODUCER_SERVICE_URL`)

## Desarrollo

```bash
cp .env.example .env    # ajusta DATABASE_URL
npm install
npm run db:migrate      # crea/aplica migraciones
npm run dev
```

## Despliegue

`Dockerfile` + `render.yaml` (Render) y `.github/workflows/ci.yml`: compila en cada push/PR y, en `main`,
publica la imagen en GHCR y dispara el deploy hook de Render si existe el secreto `RENDER_DEPLOY_HOOK_URL`.
