CREATE UNIQUE INDEX IF NOT EXISTS "stock_almacen_unico_incluso_sin_lote"
ON "stock_almacen" (
  "producto_id",
  "almacen_id",
  COALESCE("lote_id", 0),
  "estado_inventario_id"
);

-- Solo puede existir una unidad de negocio principal. Prisma no puede expresarlo con
-- @@unique porque necesita un índice parcial (WHERE): sin el WHERE, la unicidad también
-- aplicaría a los `false` y no podría haber más de una unidad satélite.
CREATE UNIQUE INDEX IF NOT EXISTS "unidad_negocio_una_sola_principal"
ON "unidad_negocio" ("principal")
WHERE "principal";

-- Un mismo método de cobro no se puede repetir para el mismo dueño: el Yape 953323112 del
-- repartidor 1 va una sola vez. Prisma no puede expresarlo con @@unique porque Postgres
-- trata cada NULL como distinto, y entonces dos "Efectivo global" (referencia y trabajador
-- en null) no chocarían. Con COALESCE los nulos se comparan como iguales.
CREATE UNIQUE INDEX IF NOT EXISTS "metodo_pago_unico_por_dueno"
ON "metodo_pago" (
  COALESCE("categoria_id", 0),
  COALESCE("referencia", ''),
  COALESCE("trabajador_id", 0)
);

-- Se recrean porque versiones anteriores mezclaban devolución con el estado
-- principal de la operación.
ALTER TABLE "venta" DROP CONSTRAINT IF EXISTS "venta_estado_valido";
ALTER TABLE "almacen" DROP CONSTRAINT IF EXISTS "almacen_tipo_valido";
ALTER TABLE "movimiento_inventario" DROP CONSTRAINT IF EXISTS "movimiento_tipo_valido";
-- Se recrea porque el conteo físico agrega CARGA_INICIAL (el inventario de arranque). El bloque
-- de abajo usa IF NOT EXISTS, así que sin este DROP el CHECK viejo quedaría y rechazaría el
-- primer guardado de una carga inicial.
ALTER TABLE "movimiento_inventario" DROP CONSTRAINT IF EXISTS "movimiento_operacion_valida";
-- Se recrea porque se eliminó la columna "merma" de la producción.
ALTER TABLE "orden_produccion" DROP CONSTRAINT IF EXISTS "orden_produccion_cantidades_validas";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lote_estado_valido') THEN
    ALTER TABLE "lote" ADD CONSTRAINT "lote_estado_valido"
      CHECK ("estado" IN ('ACTIVO', 'VENCIDO', 'AGOTADO', 'BLOQUEADO'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venta_tipo_pago_valido') THEN
    ALTER TABLE "venta" ADD CONSTRAINT "venta_tipo_pago_valido"
      CHECK ("tipo_pago" IN ('CONTADO', 'CREDITO', 'MIXTO'));
  END IF;

  -- Las ventas se registran de un solo paso (nacen CONFIRMADA), ya no existe BORRADOR.
  -- ANULADA queda reservada para una futura funcionalidad de anulación.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venta_estado_valido') THEN
    ALTER TABLE "venta" ADD CONSTRAINT "venta_estado_valido"
      CHECK ("estado" IN ('CONFIRMADA', 'ANULADA'));
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

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devolucion_venta_estado_valido') THEN
    ALTER TABLE "devolucion_venta" ADD CONSTRAINT "devolucion_venta_estado_valido"
      CHECK ("estado" IN ('BORRADOR', 'CONFIRMADA', 'ANULADA'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saldo_favor_cliente_valido') THEN
    ALTER TABLE "saldo_favor_cliente" ADD CONSTRAINT "saldo_favor_cliente_valido"
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

  -- COMPRA/DEVOLUCION_COMPRA se conservan como valores válidos porque el kardex histórico
  -- generado por el módulo de Compras (ya eliminado) sigue teniendo filas con esos valores.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimiento_operacion_valida') THEN
    ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_operacion_valida"
      CHECK ("tipo_operacion" IN (
        'COMPRA', 'VENTA', 'DEVOLUCION_COMPRA', 'DEVOLUCION_VENTA',
        'TRANSFERENCIA_ALMACEN', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO',
        'PRODUCCION', 'MERMA', 'CAMBIO_ESTADO', 'CARGA_INICIAL'
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
      CHECK ("cantidad_planificada" > 0 AND "cantidad_producida" >= 0);
  END IF;

  -- Una unidad puede optar por no llevar inventario (solo registra ventas y gastos), pero la
  -- Principal no: es la que produce, y de su almacén sale el stock de todo el negocio.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unidad_negocio_principal_con_inventario') THEN
    ALTER TABLE "unidad_negocio" ADD CONSTRAINT "unidad_negocio_principal_con_inventario"
      CHECK (NOT "principal" OR "controla_inventario");
  END IF;

  -- Un cuadre es un conteo contra lo que ya había, o la carga del inventario de arranque.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conteo_inventario_tipo_valido') THEN
    ALTER TABLE "conteo_inventario" ADD CONSTRAINT "conteo_inventario_tipo_valido"
      CHECK ("tipo" IN ('CONTEO', 'CARGA_INICIAL'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conteo_inventario_cantidades_validas') THEN
    ALTER TABLE "conteo_inventario" ADD CONSTRAINT "conteo_inventario_cantidades_validas"
      CHECK (
        "posiciones" >= 0
        AND "contadas" >= 0
        AND "contadas" <= "posiciones"
        AND "diferencias" >= 0
        AND "unidades_sobrantes" >= 0
        AND "unidades_faltantes" >= 0
      );
  END IF;

  -- Ni el teórico ni el contado pueden ser negativos: `stock_almacen.cantidad` tampoco puede
  -- (ver "stock_almacen_cantidades_validas"), así que una fila con negativos sería un conteo
  -- que nunca se habría podido aplicar.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'detalle_conteo_cantidades_validas') THEN
    ALTER TABLE "detalle_conteo_inventario" ADD CONSTRAINT "detalle_conteo_cantidades_validas"
      CHECK ("teorico" >= 0 AND "contado" >= 0 AND "costo_unitario" >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'detalle_conteo_motivo_valido') THEN
    ALTER TABLE "detalle_conteo_inventario" ADD CONSTRAINT "detalle_conteo_motivo_valido"
      CHECK ("motivo" IS NULL OR "motivo" IN ('ROTURA', 'MERMA', 'ERROR_DE_CARGA', 'ROBO', 'OTRO'));
  END IF;

  -- Una venta no puede recibir una cantidad negativa de vacíos: para devolver envases al
  -- cliente está el ajuste de la pantalla "Envases", no una venta en reversa.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venta_vacios_recibidos_valido') THEN
    ALTER TABLE "venta" ADD CONSTRAINT "venta_vacios_recibidos_valido"
      CHECK ("vacios_recibidos" >= 0);
  END IF;

  -- El límite de crédito puede faltar (sin límite) o ser cero (no se le fía), pero nunca
  -- negativo: un tope negativo no significaría nada.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cliente_limite_credito_valido') THEN
    ALTER TABLE "cliente" ADD CONSTRAINT "cliente_limite_credito_valido"
      CHECK ("limite_credito" IS NULL OR "limite_credito" >= 0);
  END IF;

  -- Una devolución la pide el cliente, o la genera la anulación de una venta. No hay un
  -- estado `ANULADA` en `venta`: anular ES una devolución total de este tipo.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devolucion_venta_tipo_valido') THEN
    ALTER TABLE "devolucion_venta" ADD CONSTRAINT "devolucion_venta_tipo_valido"
      CHECK ("tipo" IN ('COMERCIAL', 'ANULACION'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pago_cliente_origen_valido') THEN
    ALTER TABLE "pago_cliente" ADD CONSTRAINT "pago_cliente_origen_valido"
      CHECK ("origen" IN ('VENTA', 'COBRANZA', 'REEMBOLSO'));
  END IF;

  -- Un cobro es siempre positivo. El único monto negativo admitido es el reembolso de una
  -- anulación, y tiene que decir de qué devolución salió: así ninguna otra vía puede meter un
  -- negativo que descuadre la caja sin dejar rastro de por qué.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pago_cliente_monto_valido') THEN
    ALTER TABLE "pago_cliente" ADD CONSTRAINT "pago_cliente_monto_valido"
      CHECK (
        ("origen" = 'REEMBOLSO' AND "monto" < 0 AND "devolucion_venta_id" IS NOT NULL)
        OR ("origen" <> 'REEMBOLSO' AND "monto" > 0)
      );
  END IF;

  -- El saldo de envases de un cliente nunca puede quedar negativo (lo valida también
  -- `ContainersService.adjust` y `aplicarEnvasesDeVenta`), así que ningún movimiento puede
  -- registrar un saldo posterior negativo. La cantidad va siempre sin signo: la dirección la
  -- dice `type` (OUT_FULL entrega, IN_EMPTY retorno), no el signo del número.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'container_movement_cantidades_validas') THEN
    ALTER TABLE "container_movements" ADD CONSTRAINT "container_movement_cantidades_validas"
      CHECK ("quantity" >= 0 AND "balance_after" >= 0);
  END IF;
END
$$;
