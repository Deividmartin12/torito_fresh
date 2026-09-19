-- Los roles dejan de ser el enum `RoleName` y pasan a ser filas editables con su lista de
-- permisos. Es lo que permite crear un rol nuevo desde Configuración › Roles y permisos sin
-- tocar el código ni volver a desplegar.
--
-- La migración NO le quita nada a nadie: los cinco roles que ya existían conservan su clave
-- (el valor que tenía el enum) y reciben exactamente los permisos que ejercían cuando estaban
-- escritos a mano en los `@Roles` del API. Las filas de `users` no se tocan: siguen apuntando
-- al mismo `role_id` de siempre.

-- 1) Columnas nuevas de `roles`. `nombre` sale del valor del enum traducido, y la clave se
--    queda con el texto crudo, que es lo que ya guardaba la columna `name`.
ALTER TABLE "roles" ADD COLUMN "clave" VARCHAR(40);
ALTER TABLE "roles" ADD COLUMN "nombre" VARCHAR(60);
ALTER TABLE "roles" ADD COLUMN "descripcion" VARCHAR(250);
ALTER TABLE "roles" ADD COLUMN "sistema" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "roles" ADD COLUMN "acceso_total" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "roles" ADD COLUMN "estado" BOOLEAN NOT NULL DEFAULT true;

UPDATE "roles" SET "clave" = "name"::TEXT;

UPDATE "roles" SET
  "nombre" = CASE "clave"
    WHEN 'ADMIN' THEN 'Administrador'
    WHEN 'SELLER' THEN 'Vendedor'
    WHEN 'DELIVERY' THEN 'Repartidor'
    WHEN 'WAREHOUSE' THEN 'Almacén'
    WHEN 'SOCIO' THEN 'Responsable de unidad'
    ELSE "clave"
  END,
  "descripcion" = CASE "clave"
    WHEN 'ADMIN' THEN 'Ve y hace todo, en todas las unidades de negocio.'
    WHEN 'SELLER' THEN 'Lleva las ventas, los clientes, los gastos y la cobranza de su unidad.'
    WHEN 'DELIVERY' THEN 'Entrega, cobra en la puerta y recibe envases. Solo carga, no corrige.'
    WHEN 'WAREHOUSE' THEN 'Produce, controla el stock y despacha. No toca dinero ni clientes.'
    WHEN 'SOCIO' THEN 'Lleva su propio puesto: sus ventas, sus gastos, sus clientes y su stock, sin ver los de la unidad principal.'
    ELSE NULL
  END,
  "sistema" = true,
  -- El administrador lo puede todo por esta bandera y no por una lista de permisos marcados:
  -- así los permisos que se agreguen al catálogo mañana también le corresponden solos.
  "acceso_total" = ("clave" = 'ADMIN');

-- Puede faltar alguno si la base nunca corrió el seed completo. Se crean para que el panel
-- los muestre y para que nadie quede sin un rol al que moverse.
INSERT INTO "roles" ("id", "name", "clave", "nombre", "descripcion", "sistema", "acceso_total", "estado", "created_at", "updated_at")
SELECT
  md5(random()::text || clock_timestamp()::text),
  faltante."clave"::"RoleName",
  faltante."clave",
  faltante."nombre",
  faltante."descripcion",
  true,
  faltante."clave" = 'ADMIN',
  true,
  NOW(),
  NOW()
FROM (VALUES
  ('ADMIN', 'Administrador', 'Ve y hace todo, en todas las unidades de negocio.'),
  ('SELLER', 'Vendedor', 'Lleva las ventas, los clientes, los gastos y la cobranza de su unidad.'),
  ('DELIVERY', 'Repartidor', 'Entrega, cobra en la puerta y recibe envases. Solo carga, no corrige.'),
  ('WAREHOUSE', 'Almacén', 'Produce, controla el stock y despacha. No toca dinero ni clientes.'),
  ('SOCIO', 'Responsable de unidad', 'Lleva su propio puesto: sus ventas, sus gastos, sus clientes y su stock, sin ver los de la unidad principal.')
) AS faltante("clave", "nombre", "descripcion")
WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "roles"."clave" = faltante."clave");

ALTER TABLE "roles" ALTER COLUMN "clave" SET NOT NULL;
ALTER TABLE "roles" ALTER COLUMN "nombre" SET NOT NULL;
CREATE UNIQUE INDEX "roles_clave_key" ON "roles"("clave");
CREATE UNIQUE INDEX "roles_nombre_key" ON "roles"("nombre");

-- 2) Fuera la columna del enum y el enum mismo. A partir de acá un rol nuevo es un INSERT.
DROP INDEX IF EXISTS "roles_name_key";
ALTER TABLE "roles" DROP COLUMN "name";
DROP TYPE "RoleName";

-- 3) Los permisos otorgados. Sin clave foránea contra un catálogo de permisos a propósito:
--    el catálogo vive en el código (apps/api/src/auth/permisos.ts), porque cada permiso
--    necesita que algún endpoint lo consulte y una fila suelta no habilitaría nada.
CREATE TABLE "rol_permiso" (
  "role_id" TEXT NOT NULL,
  "clave" VARCHAR(60) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rol_permiso_pkey" PRIMARY KEY ("role_id", "clave")
);

CREATE INDEX "rol_permiso_role_id_idx" ON "rol_permiso"("role_id");

ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) Los permisos con los que arranca cada rol. Reproducen EXACTAMENTE lo que cada uno podía
--    hacer con los `@Roles` de antes, para que al desplegar nadie pierda una pantalla ni un
--    botón. El administrador no lleva filas: le alcanza con `acceso_total`.
INSERT INTO "rol_permiso" ("role_id", "clave", "created_at")
SELECT "roles"."id", otorgado."clave", NOW()
FROM "roles"
JOIN (VALUES
  ('SELLER', 'dashboard.ver'),
  ('SELLER', 'documento.consultar'),
  ('SELLER', 'gastos.ver'),
  ('SELLER', 'gastos.registrar'),
  ('SELLER', 'gastos.categorias.crear'),
  ('SELLER', 'gastos.categorias.editar'),
  ('SELLER', 'proveedores.ver'),
  ('SELLER', 'proveedores.crear'),
  ('SELLER', 'proveedores.editar'),
  ('SELLER', 'lotes.ver'),
  ('SELLER', 'lotes.editar'),
  ('SELLER', 'clientes.ver'),
  ('SELLER', 'clientes.crear'),
  ('SELLER', 'clientes.editar'),
  ('SELLER', 'ventas.ver'),
  ('SELLER', 'ventas.registrar'),
  ('SELLER', 'ventas.editar'),
  ('SELLER', 'recargas.ver'),
  ('SELLER', 'devoluciones.ver'),
  ('SELLER', 'devoluciones.registrar'),
  ('SELLER', 'envases.ver'),
  ('SELLER', 'bidonesRotos.ver'),
  ('SELLER', 'bidonesRotos.registrar'),
  ('SELLER', 'productos.ver'),
  ('SELLER', 'productos.editar'),
  ('SELLER', 'almacenes.ver'),
  ('SELLER', 'almacenes.crear'),
  ('SELLER', 'stock.ver'),
  ('SELLER', 'kardex.ver'),
  ('SELLER', 'cobranzas.ver'),
  ('SELLER', 'cobranzas.registrar'),
  ('SELLER', 'metodosPago.ver'),
  ('SELLER', 'metodosPago.crearPropio'),
  ('SELLER', 'reportes.ver'),
  ('SELLER', 'reportes.trabajadores'),
  ('SELLER', 'reportes.reparto'),
  ('SELLER', 'trabajadores.ver'),

  ('WAREHOUSE', 'dashboard.ver'),
  ('WAREHOUSE', 'documento.consultar'),
  ('WAREHOUSE', 'proveedores.ver'),
  ('WAREHOUSE', 'proveedores.crear'),
  ('WAREHOUSE', 'proveedores.editar'),
  ('WAREHOUSE', 'produccion.gestionar'),
  ('WAREHOUSE', 'lotes.ver'),
  ('WAREHOUSE', 'lotes.editar'),
  ('WAREHOUSE', 'ventas.ver'),
  ('WAREHOUSE', 'ventas.registrar'),
  ('WAREHOUSE', 'ventas.editar'),
  ('WAREHOUSE', 'recargas.ver'),
  ('WAREHOUSE', 'devoluciones.ver'),
  ('WAREHOUSE', 'devoluciones.registrar'),
  ('WAREHOUSE', 'envases.ver'),
  ('WAREHOUSE', 'envases.ajustar'),
  ('WAREHOUSE', 'bidonesRotos.ver'),
  ('WAREHOUSE', 'bidonesRotos.registrar'),
  ('WAREHOUSE', 'productos.ver'),
  ('WAREHOUSE', 'productos.editar'),
  ('WAREHOUSE', 'almacenes.ver'),
  ('WAREHOUSE', 'almacenes.crear'),
  ('WAREHOUSE', 'stock.ver'),
  ('WAREHOUSE', 'kardex.ver'),
  ('WAREHOUSE', 'cobranzas.ver'),
  ('WAREHOUSE', 'metodosPago.ver'),
  ('WAREHOUSE', 'metodosPago.crearPropio'),
  ('WAREHOUSE', 'reportes.ver'),
  ('WAREHOUSE', 'reportes.trabajadores'),
  ('WAREHOUSE', 'reportes.reparto'),
  ('WAREHOUSE', 'trabajadores.ver'),

  ('DELIVERY', 'dashboard.ver'),
  ('DELIVERY', 'documento.consultar'),
  ('DELIVERY', 'clientes.ver'),
  ('DELIVERY', 'clientes.crear'),
  ('DELIVERY', 'ventas.ver'),
  ('DELIVERY', 'ventas.registrar'),
  ('DELIVERY', 'envases.ver'),
  ('DELIVERY', 'envases.ajustar'),
  ('DELIVERY', 'productos.ver'),
  ('DELIVERY', 'stock.ver'),
  ('DELIVERY', 'metodosPago.ver'),
  ('DELIVERY', 'metodosPago.crearPropio'),
  ('DELIVERY', 'reportes.reparto'),

  ('SOCIO', 'dashboard.ver'),
  ('SOCIO', 'documento.consultar'),
  ('SOCIO', 'gastos.ver'),
  ('SOCIO', 'gastos.registrar'),
  ('SOCIO', 'gastos.categorias.crear'),
  ('SOCIO', 'proveedores.ver'),
  ('SOCIO', 'proveedores.crear'),
  ('SOCIO', 'proveedores.editar'),
  ('SOCIO', 'clientes.ver'),
  ('SOCIO', 'clientes.crear'),
  ('SOCIO', 'clientes.editar'),
  ('SOCIO', 'ventas.ver'),
  ('SOCIO', 'ventas.registrar'),
  ('SOCIO', 'ventas.editar'),
  ('SOCIO', 'devoluciones.ver'),
  ('SOCIO', 'devoluciones.registrar'),
  ('SOCIO', 'envases.ver'),
  ('SOCIO', 'envases.ajustar'),
  ('SOCIO', 'productos.ver'),
  ('SOCIO', 'stock.ver'),
  ('SOCIO', 'kardex.ver'),
  ('SOCIO', 'cobranzas.ver'),
  ('SOCIO', 'cobranzas.registrar'),
  ('SOCIO', 'metodosPago.ver'),
  ('SOCIO', 'metodosPago.crearPropio'),
  ('SOCIO', 'reportes.ver'),
  ('SOCIO', 'reportes.reparto'),
  ('SOCIO', 'trabajadores.ver')
) AS otorgado("rol", "clave") ON otorgado."rol" = "roles"."clave"
ON CONFLICT ("role_id", "clave") DO NOTHING;
