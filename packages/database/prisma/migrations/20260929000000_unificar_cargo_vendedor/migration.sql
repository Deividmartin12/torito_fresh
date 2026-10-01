-- Vendedor y Repartidor son el mismo cargo laboral. Los roles de acceso SELLER y DELIVERY
-- permanecen separados: esta migración solo normaliza cómo se nombra el puesto de la persona.
UPDATE "trabajador"
SET "cargo" = 'Vendedor'
WHERE "cargo" = 'Repartidor';
