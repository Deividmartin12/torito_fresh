-- Los bidones rotos pasan a pertenecer a una unidad de negocio.
--
-- Era la única tabla operativa sin forma de saber en qué puesto ocurrió el registro: el
-- listado sumaba los bidones rotos de todas las unidades en la misma cifra, y cada puesto
-- veía los de los demás.
--
-- La unidad NO se hereda del trabajador aunque exista `trabajador_id`: a una persona la
-- pueden mover de puesto y entonces su historial se mudaría con ella. El registro es un hecho
-- que ocurrió en un lugar concreto. Además la columna es opcional, así que heredarla dejaría
-- las filas sin autor fuera de todo listado.
--
-- No destructiva y en tres pasos, igual que 20260916000000_unidad_negocio: columna nullable,
-- backfill, y recién entonces NOT NULL. Si el backfill fallara, la transacción revierte y no
-- queda nada a medias.

ALTER TABLE "bidon_roto" ADD COLUMN "unidad_negocio_id" BIGINT;

-- Lo que tiene autor hereda la unidad de ese trabajador: es donde realmente ocurrió.
UPDATE "bidon_roto" b
   SET "unidad_negocio_id" = t."unidad_negocio_id"
  FROM "trabajador" t
 WHERE t."id" = b."trabajador_id"
   AND b."unidad_negocio_id" IS NULL;

-- Lo que quedó sin autor va a la Principal, que es donde estaba todo antes de que existieran
-- las unidades.
UPDATE "bidon_roto"
   SET "unidad_negocio_id" = (SELECT "id" FROM "unidad_negocio" WHERE "principal")
 WHERE "unidad_negocio_id" IS NULL;

ALTER TABLE "bidon_roto" ALTER COLUMN "unidad_negocio_id" SET NOT NULL;

-- RESTRICT: una unidad que todavía tiene registros no se puede borrar. Mismo criterio que
-- venta y gasto.
ALTER TABLE "bidon_roto" ADD CONSTRAINT "bidon_roto_unidad_negocio_id_fkey"
  FOREIGN KEY ("unidad_negocio_id") REFERENCES "unidad_negocio"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- El listado filtra por unidad y ordena por fecha: el índice replica bidon_roto_fecha_idx con
-- la unidad al frente.
CREATE INDEX "bidon_roto_unidad_negocio_id_fecha_idx" ON "bidon_roto"("unidad_negocio_id", "fecha");
