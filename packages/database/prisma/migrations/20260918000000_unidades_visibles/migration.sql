-- Qué unidades de negocio mira cada usuario.
--
-- Hasta ahora la unidad activa vivía en `localStorage`, así que era del navegador y no de la
-- persona: se perdía al cambiar de equipo y se heredaba entre usuarios de la misma máquina. Y
-- solo se podía mirar UNA unidad a la vez, de modo que con las ventas en un puesto y los gastos
-- en otro, cualquier reporte se veía vacío sin explicación.
--
-- **Sin ninguna fila significa "todas"**, y es el estado por defecto de toda cuenta existente.
-- Se modela así a propósito: si se guardaran las unidades de hoy una por una, una unidad creada
-- mañana quedaría fuera y el usuario vería números incompletos sin enterarse.
--
-- No destructiva: crea una tabla nueva y no toca ninguna fila existente. Al no insertar nada,
-- todas las cuentas arrancan viendo todo, que es el comportamiento más seguro.
--
-- ON DELETE CASCADE en las dos claves: esto es una preferencia, no un dato del negocio. Si se
-- borra la cuenta o la unidad, la preferencia se va con ellas y no bloquea el borrado (al revés
-- que `venta`/`gasto`, que usan RESTRICT justamente para impedirlo).

CREATE TABLE "usuario_unidad_visible" (
    "user_id" TEXT NOT NULL,
    "unidad_negocio_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_unidad_visible_pkey" PRIMARY KEY ("user_id", "unidad_negocio_id")
);

-- El acceso siempre es "las unidades de este usuario": la clave primaria ya empieza por
-- user_id, pero el índice explícito deja clara la intención y cubre el borrado en bloque.
CREATE INDEX "usuario_unidad_visible_user_id_idx" ON "usuario_unidad_visible"("user_id");

ALTER TABLE "usuario_unidad_visible" ADD CONSTRAINT "usuario_unidad_visible_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "usuario_unidad_visible" ADD CONSTRAINT "usuario_unidad_visible_unidad_negocio_id_fkey"
  FOREIGN KEY ("unidad_negocio_id") REFERENCES "unidad_negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
