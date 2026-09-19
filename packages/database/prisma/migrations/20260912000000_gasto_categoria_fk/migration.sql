-- La categoría del gasto deja de ser texto libre y pasa a ser una llave foránea a
-- `categoria_gasto`. Antes las dos cosas convivían sin relación: el catálogo por un lado y
-- una copia del nombre dentro de cada gasto por el otro, que había que sincronizar a mano
-- al renombrar una categoría.
--
-- La migración no borra ningún gasto: primero da de alta en el catálogo cualquier
-- categoría que solo existiera escrita dentro de `gasto`, después enlaza cada gasto con su
-- fila y recién al final suelta la columna de texto, que ya quedó representada por el
-- enlace.

ALTER TABLE "gasto" ADD COLUMN "categoria_id" BIGINT;

-- 1. Categorías que estaban escritas en algún gasto pero no existían en el catálogo.
--    El DISTINCT ON ignora mayúsculas y espacios para no crear "Luz" y "LUZ" por separado.
INSERT INTO "categoria_gasto" ("nombre", "created_at", "updated_at")
SELECT DISTINCT ON (lower(btrim(g."categoria"))) btrim(g."categoria"), NOW(), NOW()
FROM "gasto" g
WHERE btrim(g."categoria") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "categoria_gasto" c WHERE lower(btrim(c."nombre")) = lower(btrim(g."categoria"))
  )
ORDER BY lower(btrim(g."categoria")), btrim(g."categoria");

-- 2. Cada gasto apunta a la fila del catálogo que coincide con su texto.
UPDATE "gasto" g
SET "categoria_id" = c."id"
FROM (
  SELECT DISTINCT ON (lower(btrim("nombre"))) "id", lower(btrim("nombre")) AS clave
  FROM "categoria_gasto"
  ORDER BY lower(btrim("nombre")), "id"
) c
WHERE c.clave = lower(btrim(g."categoria"));

-- 3. Gastos que tenían la categoría en blanco: se agrupan en una categoría explícita en
--    lugar de quedarse sin enlace.
INSERT INTO "categoria_gasto" ("nombre", "created_at", "updated_at")
SELECT 'Sin categoría', NOW(), NOW()
WHERE EXISTS (SELECT 1 FROM "gasto" WHERE "categoria_id" IS NULL)
  AND NOT EXISTS (SELECT 1 FROM "categoria_gasto" WHERE "nombre" = 'Sin categoría');

UPDATE "gasto"
SET "categoria_id" = (SELECT "id" FROM "categoria_gasto" WHERE "nombre" = 'Sin categoría')
WHERE "categoria_id" IS NULL;

-- 4. Con todos los gastos enlazados, el vínculo pasa a ser obligatorio. RESTRICT: no se
--    puede borrar una categoría que todavía tiene gastos.
ALTER TABLE "gasto" ALTER COLUMN "categoria_id" SET NOT NULL;

ALTER TABLE "gasto" ADD CONSTRAINT "gasto_categoria_id_fkey"
  FOREIGN KEY ("categoria_id") REFERENCES "categoria_gasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "gasto_categoria_id_idx" ON "gasto"("categoria_id");

-- 5. La columna de texto ya no aporta nada: su contenido vive ahora en el catálogo.
DROP INDEX IF EXISTS "gasto_categoria_idx";
ALTER TABLE "gasto" DROP COLUMN "categoria";
