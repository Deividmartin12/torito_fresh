-- Revertir un gasto = anularlo. Anular no borra: marca estado=ANULADO con motivo y autor,
-- y las lecturas/reportes solo suman CONFIRMADO. Mismo criterio que la anulación de ventas
-- (devolucion_venta.tipo='ANULACION'): escribir el hecho contrario, no reescribir el original.
--
-- Es aditiva: cuatro columnas (una con default) + dos índices + una FK + un CHECK.
-- El despliegue real usa `npm run db:push` + `npm run db:constraints`; esta carpeta queda por
-- paridad con el historial del repo.

ALTER TABLE "gasto" ADD COLUMN "estado" VARCHAR(20) NOT NULL DEFAULT 'CONFIRMADO';
ALTER TABLE "gasto" ADD COLUMN "motivo_anulacion" VARCHAR(300);
ALTER TABLE "gasto" ADD COLUMN "anulado_por_id" BIGINT;
ALTER TABLE "gasto" ADD COLUMN "anulado_at" TIMESTAMPTZ;

ALTER TABLE "gasto" ADD CONSTRAINT "gasto_anulado_por_id_fkey"
  FOREIGN KEY ("anulado_por_id") REFERENCES "trabajador"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "gasto_estado_idx" ON "gasto" ("estado");
CREATE INDEX "gasto_anulado_por_id_idx" ON "gasto" ("anulado_por_id");

-- El responsable de unidad revierte sus gastos igual que anula sus ventas: es quien
-- responde por su caja. Al vendedor no se le da de fábrica (igual que ventas.anular).
INSERT INTO "rol_permiso" ("role_id", "clave", "created_at")
SELECT "roles"."id", 'gastos.anular', NOW()
FROM "roles" WHERE "roles"."clave" = 'SOCIO'
ON CONFLICT ("role_id", "clave") DO NOTHING;
