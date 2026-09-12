-- Beneficiario del gasto: a quién se le paga. Es distinto de `trabajador_id`, que sigue
-- siendo quién REGISTRÓ el gasto. Solo se llena en los gastos de "Pago a trabajador".
ALTER TABLE "gasto" ADD COLUMN "beneficiario_id" BIGINT;

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_beneficiario_id_fkey" FOREIGN KEY ("beneficiario_id") REFERENCES "trabajador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: el reporte por trabajador filtra por beneficiario + rango de fechas.
CREATE INDEX "gasto_beneficiario_id_fecha_idx" ON "gasto"("beneficiario_id", "fecha");

-- Categorías fijas del sistema: no se pueden renombrar ni eliminar desde la UI.
ALTER TABLE "categoria_gasto" ADD COLUMN "sistema" BOOLEAN NOT NULL DEFAULT false;

-- La categoría de pago a trabajador debe existir siempre y con el mismo nombre: es la que
-- activa el campo de beneficiario en el formulario de gasto.
INSERT INTO "categoria_gasto" ("nombre", "sistema", "created_at", "updated_at")
VALUES ('Pago a trabajador', true, NOW(), NOW())
ON CONFLICT ("nombre") DO UPDATE SET "sistema" = true, "updated_at" = NOW();
