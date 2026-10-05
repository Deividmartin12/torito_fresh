-- CreateTable
CREATE TABLE "cuenta_caja" (
    "id" BIGSERIAL NOT NULL,
    "unidad_negocio_id" BIGINT NOT NULL,
    "metodo_pago_id" BIGINT NOT NULL,
    "saldo_inicial" DECIMAL(12,2),
    "fecha_apertura" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuenta_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_caja" (
    "id" BIGSERIAL NOT NULL,
    "cuenta_id" BIGINT NOT NULL,
    "tipo" VARCHAR(30) NOT NULL,
    "importe" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "registrado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trabajador_id" BIGINT,
    "descripcion" VARCHAR(500) NOT NULL,
    "fuente_tipo" VARCHAR(30),
    "fuente_id" BIGINT,
    "venta_id" BIGINT,
    "clave_operacion" VARCHAR(100),

    CONSTRAINT "movimiento_caja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cuenta_caja_unidad_negocio_id_metodo_pago_id_key" ON "cuenta_caja"("unidad_negocio_id", "metodo_pago_id");

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_caja_clave_operacion_key" ON "movimiento_caja"("clave_operacion");

-- CreateIndex
CREATE INDEX "movimiento_caja_cuenta_id_fecha_id_idx" ON "movimiento_caja"("cuenta_id", "fecha", "id");

-- CreateIndex
CREATE INDEX "movimiento_caja_fuente_tipo_fuente_id_idx" ON "movimiento_caja"("fuente_tipo", "fuente_id");

-- AddForeignKey
ALTER TABLE "cuenta_caja" ADD CONSTRAINT "cuenta_caja_unidad_negocio_id_fkey" FOREIGN KEY ("unidad_negocio_id") REFERENCES "unidad_negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuenta_caja" ADD CONSTRAINT "cuenta_caja_metodo_pago_id_fkey" FOREIGN KEY ("metodo_pago_id") REFERENCES "metodo_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuenta_caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_trabajador_id_fkey" FOREIGN KEY ("trabajador_id") REFERENCES "trabajador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

