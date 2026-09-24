-- Anular una venta = devolución total automática + reembolso en efectivo al cliente.
--
-- No se agrega ningún estado nuevo a `venta`: anular ES la devolución, marcada con
-- `devolucion_venta.tipo = 'ANULACION'`. Así deshacer una venta sigue el mismo criterio que
-- el resto del sistema (escribir el hecho contrario, no reescribir el original) y los
-- reportes, que ya netean devoluciones, siguen cuadrando sin tocarlos.
--
-- Es aditiva: tres columnas con default o nulables, tres índices y una clave foránea. El
-- único retoque de datos existentes está al final y es idempotente.
--
-- El despliegue real usa `npm run db:push` + `npm run db:constraints`; esta carpeta queda por
-- paridad con el historial del repo.

ALTER TABLE "devolucion_venta" ADD COLUMN "tipo" VARCHAR(20) NOT NULL DEFAULT 'COMERCIAL';
CREATE INDEX "devolucion_venta_tipo_idx" ON "devolucion_venta" ("tipo");

ALTER TABLE "pago_cliente" ADD COLUMN "origen" VARCHAR(20) NOT NULL DEFAULT 'COBRANZA';
ALTER TABLE "pago_cliente" ADD COLUMN "devolucion_venta_id" BIGINT;
ALTER TABLE "pago_cliente" ADD CONSTRAINT "pago_cliente_devolucion_venta_id_fkey"
  FOREIGN KEY ("devolucion_venta_id") REFERENCES "devolucion_venta"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "pago_cliente_devolucion_venta_id_idx" ON "pago_cliente" ("devolucion_venta_id");
CREATE INDEX "pago_cliente_fecha_pago_origen_idx" ON "pago_cliente" ("fecha_pago", "origen");

-- Marcar los cobros que la propia venta generó. Llevan esa observación exacta desde que
-- existe `applyInitialPayments` (apps/api/src/operations/operations.service.ts), que es el
-- único lugar que los escribe.
--
-- Sin esto, el reporte de caja por trabajador los contaría como cobranza de calle y la plata
-- del día saldría al doble: el cobro de una venta al contado ya está sumado en las ventas por
-- método de pago. Correrlo dos veces deja exactamente lo mismo.
UPDATE "pago_cliente" SET "origen" = 'VENTA' WHERE "observaciones" = 'Pago inicial de la venta';
