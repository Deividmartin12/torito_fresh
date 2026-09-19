-- Unidades de negocio: separa la operación principal de los puestos satélite.
--
-- Hasta ahora toda la app era un solo negocio: las ventas y los gastos de cualquier persona
-- caían en la misma bolsa y los reportes los sumaban sin distinguir. A partir de acá cada
-- venta, gasto, cliente y almacén pertenece a exactamente una unidad, y los números de una
-- no se cruzan con los de otra salvo que el administrador pida verlos consolidados.
--
-- La migración es NO destructiva: no borra ni renombra ninguna fila. Crea la unidad
-- "Principal" y le asigna todo lo que existe hoy, así la app se comporta exactamente igual
-- que antes hasta que se cree la primera unidad satélite.
--
-- Cada columna se agrega primero nullable, se rellena, y recién entonces pasa a NOT NULL:
-- si el backfill fallara, la transacción de la migración revierte y no queda nada a medias.

CREATE TABLE "unidad_negocio" (
    "id" BIGSERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unidad_negocio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unidad_negocio_codigo_key" ON "unidad_negocio"("codigo");
CREATE UNIQUE INDEX "unidad_negocio_nombre_key" ON "unidad_negocio"("nombre");

-- La unidad de siempre. El índice único parcial que garantiza que solo haya una principal
-- vive en constraints.sql, porque Prisma no sabe expresar un índice con WHERE.
INSERT INTO "unidad_negocio" ("codigo", "nombre", "principal", "estado", "created_at", "updated_at")
VALUES ('UN-001', 'Principal', true, true, NOW(), NOW());

-- Solo cinco tablas llevan la columna. El resto hereda la unidad por relación: las cuentas
-- por cobrar y los saldos a favor por su cliente, los pagos por la venta de su cuenta, las
-- devoluciones por su venta, el stock y el kardex por su almacén, y los movimientos de
-- envases por su cliente.
ALTER TABLE "trabajador" ADD COLUMN "unidad_negocio_id" BIGINT;
ALTER TABLE "almacen"    ADD COLUMN "unidad_negocio_id" BIGINT;
ALTER TABLE "cliente"    ADD COLUMN "unidad_negocio_id" BIGINT;
ALTER TABLE "venta"      ADD COLUMN "unidad_negocio_id" BIGINT;
ALTER TABLE "gasto"      ADD COLUMN "unidad_negocio_id" BIGINT;

-- Backfill: todo lo que existe hoy es de la Principal.
UPDATE "trabajador" SET "unidad_negocio_id" = (SELECT "id" FROM "unidad_negocio" WHERE "principal") WHERE "unidad_negocio_id" IS NULL;
UPDATE "almacen"    SET "unidad_negocio_id" = (SELECT "id" FROM "unidad_negocio" WHERE "principal") WHERE "unidad_negocio_id" IS NULL;
UPDATE "cliente"    SET "unidad_negocio_id" = (SELECT "id" FROM "unidad_negocio" WHERE "principal") WHERE "unidad_negocio_id" IS NULL;
UPDATE "venta"      SET "unidad_negocio_id" = (SELECT "id" FROM "unidad_negocio" WHERE "principal") WHERE "unidad_negocio_id" IS NULL;
UPDATE "gasto"      SET "unidad_negocio_id" = (SELECT "id" FROM "unidad_negocio" WHERE "principal") WHERE "unidad_negocio_id" IS NULL;

ALTER TABLE "trabajador" ALTER COLUMN "unidad_negocio_id" SET NOT NULL;
ALTER TABLE "almacen"    ALTER COLUMN "unidad_negocio_id" SET NOT NULL;
ALTER TABLE "cliente"    ALTER COLUMN "unidad_negocio_id" SET NOT NULL;
ALTER TABLE "venta"      ALTER COLUMN "unidad_negocio_id" SET NOT NULL;
ALTER TABLE "gasto"      ALTER COLUMN "unidad_negocio_id" SET NOT NULL;

-- RESTRICT: una unidad que todavía tiene operaciones no se puede borrar. Mismo criterio
-- que gasto_categoria_id_fkey.
ALTER TABLE "trabajador" ADD CONSTRAINT "trabajador_unidad_negocio_id_fkey"
  FOREIGN KEY ("unidad_negocio_id") REFERENCES "unidad_negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "almacen" ADD CONSTRAINT "almacen_unidad_negocio_id_fkey"
  FOREIGN KEY ("unidad_negocio_id") REFERENCES "unidad_negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_unidad_negocio_id_fkey"
  FOREIGN KEY ("unidad_negocio_id") REFERENCES "unidad_negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venta" ADD CONSTRAINT "venta_unidad_negocio_id_fkey"
  FOREIGN KEY ("unidad_negocio_id") REFERENCES "unidad_negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_unidad_negocio_id_fkey"
  FOREIGN KEY ("unidad_negocio_id") REFERENCES "unidad_negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Casi toda consulta nueva filtra primero por unidad. Los dos de venta y el de gasto
-- replican los índices que ya existían (venta_fecha_idx, venta_estado_fecha_idx,
-- gasto_fecha_idx) con la unidad al frente.
CREATE INDEX "trabajador_unidad_negocio_id_idx"           ON "trabajador"("unidad_negocio_id");
CREATE INDEX "almacen_unidad_negocio_id_idx"              ON "almacen"("unidad_negocio_id");
CREATE INDEX "cliente_unidad_negocio_id_idx"              ON "cliente"("unidad_negocio_id");
CREATE INDEX "venta_unidad_negocio_id_fecha_idx"          ON "venta"("unidad_negocio_id", "fecha");
CREATE INDEX "venta_unidad_negocio_id_estado_fecha_idx"   ON "venta"("unidad_negocio_id", "estado", "fecha");
CREATE INDEX "gasto_unidad_negocio_id_fecha_idx"          ON "gasto"("unidad_negocio_id", "fecha");

-- El documento del cliente deja de ser único en toda la base y pasa a serlo dentro de la
-- unidad: si no, un puesto satélite no podría registrar a un cliente que la Principal ya
-- tiene, y el alta fallaría con un error de duplicado que no explica nada.
DROP INDEX "cliente_numero_documento_key";
CREATE UNIQUE INDEX "cliente_unidad_negocio_id_numero_documento_key"
  ON "cliente"("unidad_negocio_id", "numero_documento");
