-- Rol SOCIO: el responsable de una unidad de negocio satélite. Registra sus propias ventas
-- y gastos contra su propio almacén y sus propios clientes, y no ve los de la Principal.
--
-- Va en un archivo aparte del de `unidad_negocio` a propósito. Postgres permite agregar un
-- valor a un enum dentro de una transacción, pero prohíbe USARLO en esa misma transacción,
-- y `prisma migrate deploy` envuelve cada archivo de migración en una. Por eso acá solo se
-- agrega la etiqueta: la fila de la tabla `roles` la crea el seed, que ya recorre
-- Object.values(RoleName) y hace upsert de cada rol.
ALTER TYPE "RoleName" ADD VALUE IF NOT EXISTS 'SOCIO';
