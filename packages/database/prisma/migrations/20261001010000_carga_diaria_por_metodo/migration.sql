BEGIN;
ALTER TABLE "registro_diario" ADD COLUMN "metodo_pago_id" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "registro_diario" ADD COLUMN "partes" JSONB;

-- Recupera el método real de las ventas antiguas cuando existe un único método de cobro.
UPDATE "registro_diario" r SET "metodo_pago_id" = p.metodo_id
FROM (
  SELECT c."venta_id", MIN(p."metodo_pago_id") AS metodo_id
  FROM "cuenta_cobrar" c JOIN "pago_cliente" p ON p."cuenta_cobrar_id" = c."id"
  WHERE p."origen" = 'VENTA'
  GROUP BY c."venta_id" HAVING COUNT(DISTINCT p."metodo_pago_id") = 1
) p WHERE r."concepto" = 'VENTA' AND r."venta_id" = p."venta_id";

DROP INDEX "registro_diario_dia_concepto_key";
CREATE UNIQUE INDEX "registro_diario_dia_concepto_key" ON "registro_diario"
  ("unidad_negocio_id", "fecha", "concepto", "categoria_metodo_pago_id", "metodo_pago_id");
COMMIT;
