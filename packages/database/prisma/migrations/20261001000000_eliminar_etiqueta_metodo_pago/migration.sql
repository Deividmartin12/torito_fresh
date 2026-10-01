BEGIN;

-- La categoría y la referencia son la única fuente del nombre visible. Los métodos
-- antiguos sin categoría conservan su identidad convirtiendo su nombre en categoría;
-- esto reemplaza el backfill manual y mantiene sus ids y pagos históricos.
INSERT INTO "categoria_metodo_pago" ("nombre", "icono", "requiere_referencia", "estado", "created_at", "updated_at")
SELECT DISTINCT
  COALESCE(NULLIF(UPPER(BTRIM("nombre")), ''), 'OTROS'),
  CASE
    WHEN UPPER("nombre") LIKE '%EFECTIVO%' THEN 'banknote'
    WHEN UPPER("nombre") LIKE '%YAPE%' OR UPPER("nombre") LIKE '%PLIN%' THEN 'smartphone'
    WHEN UPPER("nombre") LIKE '%TRANSFER%' THEN 'landmark'
    ELSE 'credit-card'
  END,
  CASE
    WHEN UPPER("nombre") LIKE '%EFECTIVO%' THEN false
    WHEN UPPER("nombre") LIKE '%YAPE%' OR UPPER("nombre") LIKE '%PLIN%'
      OR UPPER("nombre") LIKE '%TRANSFER%' THEN true
    ELSE false
  END,
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "metodo_pago"
WHERE "categoria_id" IS NULL
ON CONFLICT ("nombre") DO NOTHING;

UPDATE "metodo_pago" AS metodo
SET "categoria_id" = categoria."id"
FROM "categoria_metodo_pago" AS categoria
WHERE metodo."categoria_id" IS NULL
  AND categoria."nombre" = COALESCE(NULLIF(UPPER(BTRIM(metodo."nombre")), ''), 'OTROS');

-- La referencia (número/cuenta) y el dueño se mantienen. La etiqueta libre se elimina.
ALTER TABLE "metodo_pago" DROP COLUMN "nombre";

COMMIT;
