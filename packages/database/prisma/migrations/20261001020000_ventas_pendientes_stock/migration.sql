ALTER TABLE "detalle_venta"
ADD COLUMN "cantidad_pendiente_stock" DECIMAL(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "detalle_venta" ADD CONSTRAINT "detalle_venta_pendiente_stock_valido"
CHECK ("cantidad_pendiente_stock" >= 0 AND "cantidad_pendiente_stock" <= "cantidad");

CREATE INDEX "detalle_venta_stock_pendiente_idx" ON "detalle_venta" ("producto_id", "venta_id")
WHERE "cantidad_pendiente_stock" > 0;
