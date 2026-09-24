-- Límite de crédito por cliente, y la traza de quién autorizó pasarse de él.
--
-- Aditiva y sin backfill: todas las columnas son nulables. Los clientes ya cargados quedan
-- con `limite_credito` NULL, que significa "sin límite de monto", así que ninguno cambia de
-- comportamiento por el monto el día del despliegue.
--
-- Lo que SÍ cambia para todos es la otra regla, que vive en el código y no acá: no se le
-- vende a crédito a un cliente que tenga una cuenta vencida, tenga límite o no. Conviene
-- medir antes cuántos clientes quedarían afectados:
--   SELECT count(DISTINCT cliente_id) FROM cuenta_cobrar
--   WHERE saldo_pendiente > 0 AND fecha_vencimiento < CURRENT_DATE;
--
-- El despliegue real usa `npm run db:push` + `npm run db:constraints`; esta carpeta queda por
-- paridad con el historial del repo.

ALTER TABLE "cliente" ADD COLUMN "limite_credito" DECIMAL(12,2);

ALTER TABLE "venta" ADD COLUMN "credito_autorizado_por_id" BIGINT;
ALTER TABLE "venta" ADD COLUMN "credito_autorizado_nota" TEXT;
ALTER TABLE "venta" ADD CONSTRAINT "venta_credito_autorizado_por_id_fkey"
  FOREIGN KEY ("credito_autorizado_por_id") REFERENCES "trabajador"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "venta_credito_autorizado_por_id_idx" ON "venta" ("credito_autorizado_por_id");
