-- Los envases retornables ahora se mueven con la venta, no solo a mano desde la pantalla
-- "Envases": vender un producto retornable sube el saldo del cliente y los vacíos que entrega
-- en el momento lo bajan, todo en un solo registro.
--
-- Es puramente aditiva: dos columnas (una nulable y otra con default), un índice y una clave
-- foránea. No reescribe ni borra nada.
--
-- El despliegue real de este proyecto usa `npm run db:push` (ver deploy/windows/update.ps1),
-- que además ejecuta constraints.sql; esta carpeta queda por paridad con el historial del repo.

ALTER TABLE "container_movements" ADD COLUMN "venta_id" BIGINT;
CREATE INDEX "container_movements_venta_id_idx" ON "container_movements" ("venta_id");
ALTER TABLE "container_movements" ADD CONSTRAINT "container_movements_venta_id_fkey"
  FOREIGN KEY ("venta_id") REFERENCES "venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vacíos que el cliente entregó al momento de la venta. Las ventas ya registradas quedan en 0
-- a propósito: nunca se les preguntó, y el saldo de envases de esos clientes se venía llevando
-- a mano. No hay backfill posible ni deseable.
ALTER TABLE "venta" ADD COLUMN "vacios_recibidos" INTEGER NOT NULL DEFAULT 0;
