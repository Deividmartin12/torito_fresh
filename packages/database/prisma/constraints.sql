CREATE UNIQUE INDEX IF NOT EXISTS "stock_almacen_unico_incluso_sin_lote"
ON "stock_almacen" (
  "producto_id",
  "almacen_id",
  COALESCE("lote_id", 0),
  "estado_inventario_id"
);

-- Se recrean porque versiones anteriores mezclaban devolución con el estado
-- principal de la operación.
ALTER TABLE "compra" DROP CONSTRAINT IF EXISTS "compra_estado_valido";
ALTER TABLE "venta" DROP CONSTRAINT IF EXISTS "venta_estado_valido";
ALTER TABLE "almacen" DROP CONSTRAINT IF EXISTS "almacen_tipo_valido";
ALTER TABLE "movimiento_inventario" DROP CONSTRAINT IF EXISTS "movimiento_tipo_valido";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lote_estado_valido') THEN
    ALTER TABLE "lote" ADD CONSTRAINT "lote_estado_valido"
      CHECK ("estado" IN ('ACTIVO', 'VENCIDO', 'AGOTADO', 'BLOQUEADO'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compra_tipo_pago_valido') THEN
    ALTER TABLE "compra" ADD CONSTRAINT "compra_tipo_pago_valido"
      CHECK ("tipo_pago" IN ('CONTADO', 'CREDITO', 'MIXTO'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compra_comprobante_valido') THEN
    ALTER TABLE "compra" ADD CONSTRAINT "compra_comprobante_valido"
      CHECK ("tipo_comprobante" IN ('FACTURA', 'BOLETA', 'TICKET', 'NOTA', 'OTRO'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compra_estado_valido') THEN
    ALTER TABLE "compra" ADD CONSTRAINT "compra_estado_valido"
      CHECK ("estado" IN ('BORRADOR', 'CONFIRMADA', 'ANULADA'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compra_estado_pago_valido') THEN
    ALTER TABLE "compra" ADD CONSTRAINT "compra_estado_pago_valido"
      CHECK ("estado_pago" IN ('PENDIENTE', 'PARCIAL', 'PAGADA'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compra_estado_devolucion_valido') THEN
    ALTER TABLE "compra" ADD CONSTRAINT "compra_estado_devolucion_valido"
      CHECK ("estado_devolucion" IN ('SIN_DEVOLUCION', 'DEVOLUCION_PARCIAL', 'DEVOLUCION_TOTAL'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cuenta_pagar_estado_valido') THEN
    ALTER TABLE "cuenta_pagar" ADD CONSTRAINT "cuenta_pagar_estado_valido"
      CHECK ("estado" IN ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'ANULADA'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venta_tipo_pago_valido') THEN
    ALTER TABLE "venta" ADD CONSTRAINT "venta_tipo_pago_valido"
      CHECK ("tipo_pago" IN ('CONTADO', 'CREDITO', 'MIXTO'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venta_comprobante_valido') THEN
    ALTER TABLE "venta" ADD CONSTRAINT "venta_comprobante_valido"
      CHECK ("tipo_comprobante" IN ('FACTURA', 'BOLETA', 'TICKET', 'NOTA', 'OTRO'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venta_estado_valido') THEN
    ALTER TABLE "venta" ADD CONSTRAINT "venta_estado_valido"
      CHECK ("estado" IN ('BORRADOR', 'CONFIRMADA', 'ANULADA'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venta_estado_pago_valido') THEN
    ALTER TABLE "venta" ADD CONSTRAINT "venta_estado_pago_valido"
      CHECK ("estado_pago" IN ('PENDIENTE', 'PARCIAL', 'PAGADA'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venta_estado_devolucion_valido') THEN
    ALTER TABLE "venta" ADD CONSTRAINT "venta_estado_devolucion_valido"
      CHECK ("estado_devolucion" IN ('SIN_DEVOLUCION', 'DEVOLUCION_PARCIAL', 'DEVOLUCION_TOTAL'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cuenta_cobrar_estado_valido') THEN
    ALTER TABLE "cuenta_cobrar" ADD CONSTRAINT "cuenta_cobrar_estado_valido"
      CHECK ("estado" IN ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'ANULADA'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devolucion_compra_estado_valido') THEN
    ALTER TABLE "devolucion_compra" ADD CONSTRAINT "devolucion_compra_estado_valido"
      CHECK ("estado" IN ('BORRADOR', 'CONFIRMADA', 'ANULADA'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devolucion_venta_estado_valido') THEN
    ALTER TABLE "devolucion_venta" ADD CONSTRAINT "devolucion_venta_estado_valido"
      CHECK ("estado" IN ('BORRADOR', 'CONFIRMADA', 'ANULADA'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saldo_favor_cliente_valido') THEN
    ALTER TABLE "saldo_favor_cliente" ADD CONSTRAINT "saldo_favor_cliente_valido"
      CHECK ("monto_original" > 0 AND "monto_disponible" >= 0 AND "monto_disponible" <= "monto_original" AND "estado" IN ('DISPONIBLE', 'APLICADO', 'REEMBOLSADO', 'ANULADO'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saldo_favor_proveedor_valido') THEN
    ALTER TABLE "saldo_favor_proveedor" ADD CONSTRAINT "saldo_favor_proveedor_valido"
      CHECK ("monto_original" > 0 AND "monto_disponible" >= 0 AND "monto_disponible" <= "monto_original" AND "estado" IN ('DISPONIBLE', 'APLICADO', 'REEMBOLSADO', 'ANULADO'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'almacen_tipo_valido') THEN
    ALTER TABLE "almacen" ADD CONSTRAINT "almacen_tipo_valido"
      CHECK ("tipo" IN ('PRINCIPAL', 'SECUNDARIO', 'VEHICULO', 'PLANTA', 'MATERIA_PRIMA', 'PRODUCTO_TERMINADO', 'ENVASES'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimiento_tipo_valido') THEN
    ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_tipo_valido"
      CHECK ("tipo_movimiento" IN ('ENTRADA', 'SALIDA', 'TRANSFERENCIA', 'AJUSTE', 'CAMBIO_ESTADO', 'PRODUCCION', 'MERMA'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimiento_operacion_valida') THEN
    ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_operacion_valida"
      CHECK ("tipo_operacion" IN (
        'COMPRA', 'VENTA', 'DEVOLUCION_COMPRA', 'DEVOLUCION_VENTA',
        'TRANSFERENCIA_ALMACEN', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO',
        'PRODUCCION', 'MERMA', 'CAMBIO_ESTADO'
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimiento_estado_valido') THEN
    ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_estado_valido"
      CHECK ("estado" IN ('BORRADOR', 'CONFIRMADO', 'ANULADO'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'detalle_movimiento_direccion_valida') THEN
    ALTER TABLE "detalle_movimiento_inventario" ADD CONSTRAINT "detalle_movimiento_direccion_valida"
      CHECK ("direccion" IN ('ENTRADA', 'SALIDA'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_almacen_cantidades_validas') THEN
    ALTER TABLE "stock_almacen" ADD CONSTRAINT "stock_almacen_cantidades_validas"
      CHECK (
        "cantidad" >= 0
        AND "cantidad_reservada" >= 0
        AND "stock_minimo" >= 0
        AND ("stock_maximo" IS NULL OR "stock_maximo" >= "stock_minimo")
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orden_produccion_estado_valido') THEN
    ALTER TABLE "orden_produccion" ADD CONSTRAINT "orden_produccion_estado_valido"
      CHECK ("estado" IN ('BORRADOR', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orden_produccion_cantidades_validas') THEN
    ALTER TABLE "orden_produccion" ADD CONSTRAINT "orden_produccion_cantidades_validas"
      CHECK ("cantidad_planificada" > 0 AND "cantidad_producida" >= 0 AND "merma" >= 0);
  END IF;
END
$$;
