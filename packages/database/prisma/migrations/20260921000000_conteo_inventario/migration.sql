-- Conteo físico de inventario (el cuadre) y bidones rotos que descuentan del stock.
--
-- Es puramente aditiva: dos tablas nuevas, columnas nulables y un índice. No reescribe ni
-- borra nada, así que se aplica sobre una base con datos sin resetear. El despliegue real de
-- este proyecto usa `npm run db:push` (ver deploy/windows/update.ps1), que además ejecuta
-- constraints.sql; esta carpeta queda por paridad con el historial del repo y para que
-- `prisma migrate deploy` funcione si algún día se cambia de camino.

CREATE TABLE "conteo_inventario" (
  "id" BIGSERIAL NOT NULL,
  "almacen_id" BIGINT NOT NULL,
  "fecha" DATE NOT NULL,
  "tipo" VARCHAR(20) NOT NULL,
  "trabajador_id" BIGINT NOT NULL,
  "posiciones" INTEGER NOT NULL,
  "contadas" INTEGER NOT NULL,
  "diferencias" INTEGER NOT NULL,
  "unidades_sobrantes" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "unidades_faltantes" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "observaciones" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conteo_inventario_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conteo_inventario_almacen_id_fecha_idx" ON "conteo_inventario" ("almacen_id", "fecha");
CREATE INDEX "conteo_inventario_fecha_idx" ON "conteo_inventario" ("fecha");

ALTER TABLE "conteo_inventario" ADD CONSTRAINT "conteo_inventario_almacen_id_fkey"
  FOREIGN KEY ("almacen_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conteo_inventario" ADD CONSTRAINT "conteo_inventario_trabajador_id_fkey"
  FOREIGN KEY ("trabajador_id") REFERENCES "trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "detalle_conteo_inventario" (
  "id" BIGSERIAL NOT NULL,
  "conteo_id" BIGINT NOT NULL,
  "producto_id" BIGINT NOT NULL,
  "lote_id" BIGINT,
  "estado_inventario_id" BIGINT NOT NULL,
  "teorico" DECIMAL(12,3) NOT NULL,
  "contado" DECIMAL(12,3) NOT NULL,
  "diferencia" DECIMAL(12,3) NOT NULL,
  "costo_unitario" DECIMAL(12,4) NOT NULL,
  "motivo" VARCHAR(30),
  "nota" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "detalle_conteo_inventario_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "detalle_conteo_inventario_conteo_id_idx" ON "detalle_conteo_inventario" ("conteo_id");

ALTER TABLE "detalle_conteo_inventario" ADD CONSTRAINT "detalle_conteo_inventario_conteo_id_fkey"
  FOREIGN KEY ("conteo_id") REFERENCES "conteo_inventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "detalle_conteo_inventario" ADD CONSTRAINT "detalle_conteo_inventario_producto_id_fkey"
  FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "detalle_conteo_inventario" ADD CONSTRAINT "detalle_conteo_inventario_lote_id_fkey"
  FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "detalle_conteo_inventario" ADD CONSTRAINT "detalle_conteo_inventario_estado_inventario_id_fkey"
  FOREIGN KEY ("estado_inventario_id") REFERENCES "estado_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El movimiento de kardex que salió de un cuadre apunta a su conteo.
ALTER TABLE "movimiento_inventario" ADD COLUMN "conteo_inventario_id" BIGINT;
CREATE INDEX "movimiento_inventario_conteo_inventario_id_idx"
  ON "movimiento_inventario" ("conteo_inventario_id");
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_conteo_inventario_id_fkey"
  FOREIGN KEY ("conteo_inventario_id") REFERENCES "conteo_inventario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Qué se rompió y de dónde salió. Nulables porque las roturas anteriores se anotaron sin esta
-- información, y porque una rotura fuera del almacén se registra igual sin descontar
-- (movimiento_inventario_id en null = "quedó anotada, no se descontó").
ALTER TABLE "bidon_roto" ADD COLUMN "producto_id" BIGINT;
ALTER TABLE "bidon_roto" ADD COLUMN "almacen_id" BIGINT;
ALTER TABLE "bidon_roto" ADD COLUMN "movimiento_inventario_id" BIGINT;

ALTER TABLE "bidon_roto" ADD CONSTRAINT "bidon_roto_producto_id_fkey"
  FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bidon_roto" ADD CONSTRAINT "bidon_roto_almacen_id_fkey"
  FOREIGN KEY ("almacen_id") REFERENCES "almacen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bidon_roto" ADD CONSTRAINT "bidon_roto_movimiento_inventario_id_fkey"
  FOREIGN KEY ("movimiento_inventario_id") REFERENCES "movimiento_inventario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- La hoja de cuadre pide "las líneas de este almacén en este día"; en los índices que ya
-- existían el almacén nunca es la columna líder.
CREATE INDEX "detalle_movimiento_inventario_almacen_id_producto_id_idx"
  ON "detalle_movimiento_inventario" ("almacen_id", "producto_id");
