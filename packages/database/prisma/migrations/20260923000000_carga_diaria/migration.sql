-- Carga diaria masiva: ventas por método de pago, producción y gasto cargados como totales
-- de un día.
--
-- Aditiva y sin backfill. `cliente.sistema` nace en false para todos los clientes existentes
-- y `registro_diario` nace vacía, así que nada cambia para lo que ya está cargado.
--
-- El despliegue real usa `npm run db:push` + `npm run db:constraints`; esta carpeta queda por
-- paridad con el historial del repo. Es idempotente para poder aplicarla con
-- `prisma db execute` sin riesgo.

ALTER TABLE "cliente" ADD COLUMN IF NOT EXISTS "sistema" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "registro_diario" (
  "id" BIGSERIAL PRIMARY KEY,
  "unidad_negocio_id" BIGINT NOT NULL,
  "fecha" DATE NOT NULL,
  "concepto" VARCHAR(20) NOT NULL,
  "categoria_metodo_pago_id" BIGINT NOT NULL DEFAULT 0,
  "monto" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "cantidad" INTEGER NOT NULL DEFAULT 0,
  "venta_id" BIGINT,
  "orden_produccion_id" BIGINT,
  "gasto_id" BIGINT,
  "trabajador_id" BIGINT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "registro_diario_dia_concepto_key"
  ON "registro_diario" ("unidad_negocio_id", "fecha", "concepto", "categoria_metodo_pago_id");
CREATE INDEX IF NOT EXISTS "registro_diario_unidad_negocio_id_fecha_idx"
  ON "registro_diario" ("unidad_negocio_id", "fecha");
