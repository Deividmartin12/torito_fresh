BEGIN;

ALTER TABLE "users"
  ADD COLUMN "administrador_principal" BOOLEAN NOT NULL DEFAULT FALSE;

-- Conserva el acceso de los administradores generales existentes. Un administrador
-- vinculado a una unidad secundaria sigue limitado a su unidad hasta marcarlo explícitamente.
UPDATE "users" AS u
SET "administrador_principal" = TRUE
FROM "roles" AS r
WHERE u."role_id" = r."id"
  AND r."acceso_total" = TRUE
  AND (
    NOT EXISTS (SELECT 1 FROM "trabajador" AS t WHERE t."user_id" = u."id")
    OR EXISTS (
      SELECT 1 FROM "trabajador" AS t
      JOIN "unidad_negocio" AS n ON n."id" = t."unidad_negocio_id"
      WHERE t."user_id" = u."id" AND n."principal" = TRUE
    )
  );

CREATE INDEX "users_administrador_principal_active_idx"
  ON "users" ("administrador_principal", "active");

COMMIT;
