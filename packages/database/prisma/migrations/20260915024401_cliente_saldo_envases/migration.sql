-- Saldo de envases pendientes en el modelo Cliente moderno. Antes solo existía
-- en el modelo legacy Client (tabla "clients"), sin ninguna fila real y sin
-- endpoint para crear una: el módulo de envases estaba desconectado del resto
-- del sistema. Aditivo, no destructivo: no borra ni renombra nada.
ALTER TABLE "cliente" ADD COLUMN "saldo_envases" INTEGER NOT NULL DEFAULT 0;

-- container_movements gana una relación hacia Cliente (moderno), en paralelo
-- a la que ya tenía hacia Client (legacy, 0 filas, se conserva intacta).
-- client_id pasa a ser opcional: los movimientos nuevos usan cliente_id y no
-- deben violar el NOT NULL de una columna que ya no van a llenar.
ALTER TABLE "container_movements" DROP CONSTRAINT "container_movements_client_id_fkey";

ALTER TABLE "container_movements"
  ADD COLUMN "cliente_id" BIGINT,
  ALTER COLUMN "client_id" DROP NOT NULL;

CREATE INDEX "container_movements_cliente_id_idx" ON "container_movements"("cliente_id");

ALTER TABLE "container_movements"
  ADD CONSTRAINT "container_movements_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "container_movements"
  ADD CONSTRAINT "container_movements_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
