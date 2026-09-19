-- Una unidad de negocio que solo registra sus ventas y sus gastos.
--
-- Hasta ahora toda unidad tenía que descontar stock para poder vender: `createSale` siempre
-- llamaba a `applySaleOutbound`, y el stock solo nace de una orden de producción (no hay
-- transferencias entre almacenes, ni ajustes manuales, ni compras). Un puesto satélite que no
-- produce recibía "Stock insuficiente. Disponible: 0" en cada producto y la transacción entera
-- revertía, así que no podía registrar ni una venta.
--
-- La bandera es del LUGAR y no de la persona: el stock cuelga del almacén y el almacén de la
-- unidad, así que la misma venta tiene que comportarse igual la registre el responsable del
-- puesto o el administrador parado en él. Un rol le habría dado dos semánticas a un mismo puesto.
--
-- No destructiva y de una sola sentencia: con DEFAULT true y NOT NULL, Postgres rellena todas las
-- filas existentes en la misma pasada. La Principal y los satélites de hoy conservan exactamente
-- el comportamiento actual.
--
-- Sin índice: la tabla tiene un puñado de filas y siempre se consulta por clave primaria o por
-- `principal`. El CHECK que impide que la Principal deje de llevar inventario vive en
-- constraints.sql, junto a los demás.

ALTER TABLE "unidad_negocio"
  ADD COLUMN "controla_inventario" BOOLEAN NOT NULL DEFAULT true;
