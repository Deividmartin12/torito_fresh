-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('ADMIN', 'SELLER', 'DELIVERY', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('HOME', 'COMPANY', 'STORE', 'RESTAURANT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PREPARING', 'ON_ROUTE', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContainerMovementType" AS ENUM ('OUT_FULL', 'IN_EMPTY', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" "RoleName" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "password_hash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document_type" TEXT DEFAULT 'DNI',
    "document" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "reference" TEXT,
    "type" "ClientType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "container_balance" INTEGER NOT NULL DEFAULT 0,
    "debt_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "created_by_id" TEXT,
    "delivery_user_id" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "observations" TEXT,
    "ordered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "container_movements" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "order_id" TEXT,
    "user_id" TEXT,
    "type" "ContainerMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "notes" TEXT,
    "moved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "container_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trabajador" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT,
    "tipo_documento" VARCHAR(20) NOT NULL,
    "numero_documento" VARCHAR(20) NOT NULL,
    "nombres" VARCHAR(100) NOT NULL,
    "apellidos" VARCHAR(100) NOT NULL,
    "telefono" VARCHAR(20),
    "correo" VARCHAR(150),
    "cargo" VARCHAR(100) NOT NULL,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trabajador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedor" (
    "id" BIGSERIAL NOT NULL,
    "ruc" VARCHAR(11) NOT NULL,
    "razon_social" VARCHAR(150) NOT NULL,
    "nombre_comercial" VARCHAR(150),
    "telefono" VARCHAR(20),
    "correo" VARCHAR(150),
    "direccion" VARCHAR(250),
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gasto" (
    "id" BIGSERIAL NOT NULL,
    "fecha" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concepto" VARCHAR(200) NOT NULL,
    "categoria" VARCHAR(100) NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "comprobante" VARCHAR(50),
    "observaciones" TEXT,
    "trabajador_id" BIGINT,
    "proveedor_id" BIGINT,
    "metodo_pago_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria_gasto" (
    "id" BIGSERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categoria_gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bidon_roto" (
    "id" BIGSERIAL NOT NULL,
    "fecha" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cantidad" INTEGER NOT NULL,
    "observaciones" TEXT,
    "trabajador_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bidon_roto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_producto" (
    "id" BIGSERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tipo_producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto" (
    "id" BIGSERIAL NOT NULL,
    "tipo_producto_id" BIGINT NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "descripcion" TEXT,
    "unidad_medida" VARCHAR(30) NOT NULL,
    "capacidad_litros" DECIMAL(8,2),
    "precio_venta" DECIMAL(12,2) NOT NULL,
    "costo_referencia" DECIMAL(12,2) NOT NULL,
    "controla_lote" BOOLEAN NOT NULL DEFAULT false,
    "es_retornable" BOOLEAN NOT NULL DEFAULT false,
    "stock_minimo_global" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lote" (
    "id" BIGSERIAL NOT NULL,
    "producto_id" BIGINT NOT NULL,
    "codigo_lote" VARCHAR(50) NOT NULL,
    "fecha_produccion" DATE,
    "fecha_vencimiento" DATE,
    "costo_unitario" DECIMAL(12,4) NOT NULL,
    "estado" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria_metodo_pago" (
    "id" BIGSERIAL NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "icono" VARCHAR(30),
    "requiere_referencia" BOOLEAN NOT NULL DEFAULT false,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categoria_metodo_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metodo_pago" (
    "id" BIGSERIAL NOT NULL,
    "categoria_id" BIGINT,
    "nombre" VARCHAR(50),
    "referencia" VARCHAR(50),
    "trabajador_id" BIGINT,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metodo_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "almacen" (
    "id" BIGSERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "tipo" VARCHAR(20),
    "direccion" VARCHAR(250),
    "responsable_id" BIGINT,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "almacen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estado_inventario" (
    "id" BIGSERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "permite_venta" BOOLEAN NOT NULL DEFAULT true,
    "descripcion" TEXT,
    "estado" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "estado_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente" (
    "id" BIGSERIAL NOT NULL,
    "tipo_documento" VARCHAR(20),
    "numero_documento" VARCHAR(20),
    "nombre_legal" VARCHAR(150) NOT NULL,
    "nombre_comercial" VARCHAR(150),
    "telefono" VARCHAR(20),
    "correo" VARCHAR(150),
    "direccion" VARCHAR(250),
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta" (
    "id" BIGSERIAL NOT NULL,
    "cliente_id" BIGINT NOT NULL,
    "almacen_origen_id" BIGINT NOT NULL,
    "trabajador_id" BIGINT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "igv" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "tipo_pago" VARCHAR(20) NOT NULL,
    "metodo_pago_inicial_id" BIGINT,
    "monto_inicial" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fecha_vencimiento_pago" DATE,
    "estado" VARCHAR(25) NOT NULL,
    "estado_pago" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "estado_devolucion" VARCHAR(25) NOT NULL DEFAULT 'SIN_DEVOLUCION',
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_venta" (
    "id" BIGSERIAL NOT NULL,
    "venta_id" BIGINT NOT NULL,
    "producto_id" BIGINT NOT NULL,
    "lote_id" BIGINT,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detalle_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuenta_cobrar" (
    "id" BIGSERIAL NOT NULL,
    "venta_id" BIGINT NOT NULL,
    "cliente_id" BIGINT NOT NULL,
    "monto_original" DECIMAL(12,2) NOT NULL,
    "monto_pagado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "saldo_pendiente" DECIMAL(12,2) NOT NULL,
    "fecha_emision" DATE NOT NULL,
    "fecha_vencimiento" DATE,
    "estado" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuenta_cobrar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago_cliente" (
    "id" BIGSERIAL NOT NULL,
    "cuenta_cobrar_id" BIGINT NOT NULL,
    "metodo_pago_id" BIGINT NOT NULL,
    "trabajador_id" BIGINT NOT NULL,
    "fecha_pago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monto" DECIMAL(12,2) NOT NULL,
    "observaciones" TEXT,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'CONFIRMADO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pago_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devolucion_venta" (
    "id" BIGSERIAL NOT NULL,
    "venta_id" BIGINT NOT NULL,
    "trabajador_id" BIGINT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "estado" VARCHAR(20) NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devolucion_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_devolucion_venta" (
    "id" BIGSERIAL NOT NULL,
    "devolucion_venta_id" BIGINT NOT NULL,
    "detalle_venta_id" BIGINT NOT NULL,
    "producto_id" BIGINT NOT NULL,
    "lote_id" BIGINT,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "estado_destino_id" BIGINT NOT NULL,
    "reintegra_inventario" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "detalle_devolucion_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saldo_favor_cliente" (
    "id" BIGSERIAL NOT NULL,
    "cliente_id" BIGINT NOT NULL,
    "devolucion_venta_id" BIGINT NOT NULL,
    "monto_original" DECIMAL(12,2) NOT NULL,
    "monto_disponible" DECIMAL(12,2) NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'DISPONIBLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saldo_favor_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orden_produccion" (
    "id" BIGSERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "producto_id" BIGINT NOT NULL,
    "almacen_insumos_id" BIGINT NOT NULL,
    "almacen_producto_terminado_id" BIGINT NOT NULL,
    "trabajador_id" BIGINT NOT NULL,
    "lote_id" BIGINT,
    "codigo_lote" VARCHAR(50),
    "fecha_vencimiento" DATE,
    "cantidad_planificada" DECIMAL(12,3) NOT NULL,
    "cantidad_producida" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "costo_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fecha_planificada" DATE NOT NULL,
    "fecha_inicio" TIMESTAMP(3),
    "fecha_fin" TIMESTAMP(3),
    "estado" VARCHAR(25) NOT NULL DEFAULT 'COMPLETADA',
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orden_produccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumo_orden_produccion" (
    "id" BIGSERIAL NOT NULL,
    "orden_produccion_id" BIGINT NOT NULL,
    "producto_id" BIGINT NOT NULL,
    "cantidad_planificada" DECIMAL(12,3) NOT NULL,
    "cantidad_consumida" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "costo_unitario" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumo_orden_produccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_almacen" (
    "id" BIGSERIAL NOT NULL,
    "producto_id" BIGINT NOT NULL,
    "almacen_id" BIGINT NOT NULL,
    "lote_id" BIGINT,
    "estado_inventario_id" BIGINT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "cantidad_reservada" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "stock_minimo" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "stock_maximo" DECIMAL(12,3),
    "costo_promedio" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_almacen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_inventario" (
    "id" BIGSERIAL NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo_movimiento" VARCHAR(25) NOT NULL,
    "tipo_operacion" VARCHAR(30) NOT NULL,
    "almacen_origen_id" BIGINT,
    "almacen_destino_id" BIGINT,
    "venta_id" BIGINT,
    "devolucion_venta_id" BIGINT,
    "orden_produccion_id" BIGINT,
    "trabajador_id" BIGINT NOT NULL,
    "estado" VARCHAR(20) NOT NULL,
    "numero_referencia" VARCHAR(50),
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_movimiento_inventario" (
    "id" BIGSERIAL NOT NULL,
    "movimiento_id" BIGINT NOT NULL,
    "producto_id" BIGINT NOT NULL,
    "almacen_id" BIGINT NOT NULL,
    "lote_id" BIGINT,
    "estado_inventario_id" BIGINT NOT NULL,
    "direccion" VARCHAR(10) NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "costo_unitario" DECIMAL(12,4) NOT NULL,
    "costo_total" DECIMAL(12,2) NOT NULL,
    "saldo_anterior" DECIMAL(12,3) NOT NULL,
    "saldo_posterior" DECIMAL(12,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detalle_movimiento_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "clients_name_idx" ON "clients"("name");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_ordered_at_idx" ON "orders"("ordered_at");

-- CreateIndex
CREATE INDEX "container_movements_moved_at_idx" ON "container_movements"("moved_at");

-- CreateIndex
CREATE UNIQUE INDEX "trabajador_user_id_key" ON "trabajador"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trabajador_numero_documento_key" ON "trabajador"("numero_documento");

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_ruc_key" ON "proveedor"("ruc");

-- CreateIndex
CREATE INDEX "proveedor_razon_social_idx" ON "proveedor"("razon_social");

-- CreateIndex
CREATE INDEX "gasto_fecha_idx" ON "gasto"("fecha");

-- CreateIndex
CREATE INDEX "gasto_categoria_idx" ON "gasto"("categoria");

-- CreateIndex
CREATE INDEX "gasto_proveedor_id_idx" ON "gasto"("proveedor_id");

-- CreateIndex
CREATE INDEX "gasto_trabajador_id_fecha_idx" ON "gasto"("trabajador_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_gasto_nombre_key" ON "categoria_gasto"("nombre");

-- CreateIndex
CREATE INDEX "bidon_roto_fecha_idx" ON "bidon_roto"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_producto_nombre_key" ON "tipo_producto"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "producto_codigo_key" ON "producto"("codigo");

-- CreateIndex
CREATE INDEX "producto_nombre_idx" ON "producto"("nombre");

-- CreateIndex
CREATE INDEX "lote_fecha_vencimiento_idx" ON "lote"("fecha_vencimiento");

-- CreateIndex
CREATE INDEX "lote_producto_id_estado_idx" ON "lote"("producto_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "lote_producto_id_codigo_lote_key" ON "lote"("producto_id", "codigo_lote");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_metodo_pago_nombre_key" ON "categoria_metodo_pago"("nombre");

-- CreateIndex
CREATE INDEX "metodo_pago_trabajador_id_estado_idx" ON "metodo_pago"("trabajador_id", "estado");

-- CreateIndex
CREATE INDEX "metodo_pago_categoria_id_idx" ON "metodo_pago"("categoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "almacen_codigo_key" ON "almacen"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "estado_inventario_codigo_key" ON "estado_inventario"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_numero_documento_key" ON "cliente"("numero_documento");

-- CreateIndex
CREATE INDEX "cliente_nombre_legal_idx" ON "cliente"("nombre_legal");

-- CreateIndex
CREATE INDEX "venta_fecha_idx" ON "venta"("fecha");

-- CreateIndex
CREATE INDEX "venta_estado_fecha_idx" ON "venta"("estado", "fecha");

-- CreateIndex
CREATE INDEX "venta_cliente_id_idx" ON "venta"("cliente_id");

-- CreateIndex
CREATE INDEX "venta_trabajador_id_fecha_idx" ON "venta"("trabajador_id", "fecha");

-- CreateIndex
CREATE INDEX "detalle_venta_venta_id_idx" ON "detalle_venta"("venta_id");

-- CreateIndex
CREATE INDEX "detalle_venta_producto_id_idx" ON "detalle_venta"("producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "cuenta_cobrar_venta_id_key" ON "cuenta_cobrar"("venta_id");

-- CreateIndex
CREATE INDEX "cuenta_cobrar_estado_fecha_vencimiento_idx" ON "cuenta_cobrar"("estado", "fecha_vencimiento");

-- CreateIndex
CREATE INDEX "cuenta_cobrar_cliente_id_idx" ON "cuenta_cobrar"("cliente_id");

-- CreateIndex
CREATE INDEX "cuenta_cobrar_saldo_pendiente_idx" ON "cuenta_cobrar"("saldo_pendiente");

-- CreateIndex
CREATE INDEX "pago_cliente_fecha_pago_idx" ON "pago_cliente"("fecha_pago");

-- CreateIndex
CREATE INDEX "pago_cliente_cuenta_cobrar_id_estado_idx" ON "pago_cliente"("cuenta_cobrar_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "devolucion_venta_codigo_key" ON "devolucion_venta"("codigo");

-- CreateIndex
CREATE INDEX "devolucion_venta_fecha_idx" ON "devolucion_venta"("fecha");

-- CreateIndex
CREATE INDEX "devolucion_venta_venta_id_estado_idx" ON "devolucion_venta"("venta_id", "estado");

-- CreateIndex
CREATE INDEX "detalle_devolucion_venta_detalle_venta_id_idx" ON "detalle_devolucion_venta"("detalle_venta_id");

-- CreateIndex
CREATE INDEX "detalle_devolucion_venta_devolucion_venta_id_idx" ON "detalle_devolucion_venta"("devolucion_venta_id");

-- CreateIndex
CREATE INDEX "saldo_favor_cliente_cliente_id_estado_idx" ON "saldo_favor_cliente"("cliente_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "orden_produccion_codigo_key" ON "orden_produccion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "orden_produccion_lote_id_key" ON "orden_produccion"("lote_id");

-- CreateIndex
CREATE INDEX "orden_produccion_estado_fecha_planificada_idx" ON "orden_produccion"("estado", "fecha_planificada");

-- CreateIndex
CREATE INDEX "orden_produccion_estado_fecha_fin_idx" ON "orden_produccion"("estado", "fecha_fin");

-- CreateIndex
CREATE UNIQUE INDEX "consumo_orden_produccion_orden_produccion_id_producto_id_key" ON "consumo_orden_produccion"("orden_produccion_id", "producto_id");

-- CreateIndex
CREATE INDEX "stock_almacen_almacen_id_estado_inventario_id_idx" ON "stock_almacen"("almacen_id", "estado_inventario_id");

-- CreateIndex
CREATE INDEX "stock_almacen_producto_id_almacen_id_estado_inventario_id_idx" ON "stock_almacen"("producto_id", "almacen_id", "estado_inventario_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_almacen_producto_id_almacen_id_lote_id_estado_inventa_key" ON "stock_almacen"("producto_id", "almacen_id", "lote_id", "estado_inventario_id");

-- CreateIndex
CREATE INDEX "movimiento_inventario_fecha_idx" ON "movimiento_inventario"("fecha");

-- CreateIndex
CREATE INDEX "movimiento_inventario_tipo_operacion_estado_idx" ON "movimiento_inventario"("tipo_operacion", "estado");

-- CreateIndex
CREATE INDEX "movimiento_inventario_venta_id_idx" ON "movimiento_inventario"("venta_id");

-- CreateIndex
CREATE INDEX "movimiento_inventario_venta_id_tipo_operacion_tipo_movimien_idx" ON "movimiento_inventario"("venta_id", "tipo_operacion", "tipo_movimiento", "estado");

-- CreateIndex
CREATE INDEX "movimiento_inventario_devolucion_venta_id_idx" ON "movimiento_inventario"("devolucion_venta_id");

-- CreateIndex
CREATE INDEX "movimiento_inventario_orden_produccion_id_idx" ON "movimiento_inventario"("orden_produccion_id");

-- CreateIndex
CREATE INDEX "movimiento_inventario_numero_referencia_idx" ON "movimiento_inventario"("numero_referencia");

-- CreateIndex
CREATE INDEX "detalle_movimiento_inventario_producto_id_almacen_id_lote_i_idx" ON "detalle_movimiento_inventario"("producto_id", "almacen_id", "lote_id");

-- CreateIndex
CREATE INDEX "detalle_movimiento_inventario_movimiento_id_idx" ON "detalle_movimiento_inventario"("movimiento_id");

-- CreateIndex
CREATE INDEX "detalle_movimiento_inventario_producto_id_movimiento_id_idx" ON "detalle_movimiento_inventario"("producto_id", "movimiento_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_user_id_fkey" FOREIGN KEY ("delivery_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_movements" ADD CONSTRAINT "container_movements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_movements" ADD CONSTRAINT "container_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_movements" ADD CONSTRAINT "container_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajador" ADD CONSTRAINT "trabajador_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_trabajador_id_fkey" FOREIGN KEY ("trabajador_id") REFERENCES "trabajador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_metodo_pago_id_fkey" FOREIGN KEY ("metodo_pago_id") REFERENCES "metodo_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bidon_roto" ADD CONSTRAINT "bidon_roto_trabajador_id_fkey" FOREIGN KEY ("trabajador_id") REFERENCES "trabajador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_tipo_producto_id_fkey" FOREIGN KEY ("tipo_producto_id") REFERENCES "tipo_producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metodo_pago" ADD CONSTRAINT "metodo_pago_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_metodo_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metodo_pago" ADD CONSTRAINT "metodo_pago_trabajador_id_fkey" FOREIGN KEY ("trabajador_id") REFERENCES "trabajador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "almacen" ADD CONSTRAINT "almacen_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "trabajador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_almacen_origen_id_fkey" FOREIGN KEY ("almacen_origen_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_trabajador_id_fkey" FOREIGN KEY ("trabajador_id") REFERENCES "trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_venta" ADD CONSTRAINT "detalle_venta_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_venta" ADD CONSTRAINT "detalle_venta_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_venta" ADD CONSTRAINT "detalle_venta_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuenta_cobrar" ADD CONSTRAINT "cuenta_cobrar_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuenta_cobrar" ADD CONSTRAINT "cuenta_cobrar_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_cliente" ADD CONSTRAINT "pago_cliente_cuenta_cobrar_id_fkey" FOREIGN KEY ("cuenta_cobrar_id") REFERENCES "cuenta_cobrar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_cliente" ADD CONSTRAINT "pago_cliente_metodo_pago_id_fkey" FOREIGN KEY ("metodo_pago_id") REFERENCES "metodo_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_cliente" ADD CONSTRAINT "pago_cliente_trabajador_id_fkey" FOREIGN KEY ("trabajador_id") REFERENCES "trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_venta" ADD CONSTRAINT "devolucion_venta_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_venta" ADD CONSTRAINT "devolucion_venta_trabajador_id_fkey" FOREIGN KEY ("trabajador_id") REFERENCES "trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_devolucion_venta" ADD CONSTRAINT "detalle_devolucion_venta_devolucion_venta_id_fkey" FOREIGN KEY ("devolucion_venta_id") REFERENCES "devolucion_venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_devolucion_venta" ADD CONSTRAINT "detalle_devolucion_venta_detalle_venta_id_fkey" FOREIGN KEY ("detalle_venta_id") REFERENCES "detalle_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_devolucion_venta" ADD CONSTRAINT "detalle_devolucion_venta_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_devolucion_venta" ADD CONSTRAINT "detalle_devolucion_venta_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_devolucion_venta" ADD CONSTRAINT "detalle_devolucion_venta_estado_destino_id_fkey" FOREIGN KEY ("estado_destino_id") REFERENCES "estado_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldo_favor_cliente" ADD CONSTRAINT "saldo_favor_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldo_favor_cliente" ADD CONSTRAINT "saldo_favor_cliente_devolucion_venta_id_fkey" FOREIGN KEY ("devolucion_venta_id") REFERENCES "devolucion_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_produccion" ADD CONSTRAINT "orden_produccion_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_produccion" ADD CONSTRAINT "orden_produccion_almacen_insumos_id_fkey" FOREIGN KEY ("almacen_insumos_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_produccion" ADD CONSTRAINT "orden_produccion_almacen_producto_terminado_id_fkey" FOREIGN KEY ("almacen_producto_terminado_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_produccion" ADD CONSTRAINT "orden_produccion_trabajador_id_fkey" FOREIGN KEY ("trabajador_id") REFERENCES "trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_produccion" ADD CONSTRAINT "orden_produccion_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_orden_produccion" ADD CONSTRAINT "consumo_orden_produccion_orden_produccion_id_fkey" FOREIGN KEY ("orden_produccion_id") REFERENCES "orden_produccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_orden_produccion" ADD CONSTRAINT "consumo_orden_produccion_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_almacen" ADD CONSTRAINT "stock_almacen_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_almacen" ADD CONSTRAINT "stock_almacen_almacen_id_fkey" FOREIGN KEY ("almacen_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_almacen" ADD CONSTRAINT "stock_almacen_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_almacen" ADD CONSTRAINT "stock_almacen_estado_inventario_id_fkey" FOREIGN KEY ("estado_inventario_id") REFERENCES "estado_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_almacen_origen_id_fkey" FOREIGN KEY ("almacen_origen_id") REFERENCES "almacen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_almacen_destino_id_fkey" FOREIGN KEY ("almacen_destino_id") REFERENCES "almacen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_devolucion_venta_id_fkey" FOREIGN KEY ("devolucion_venta_id") REFERENCES "devolucion_venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_orden_produccion_id_fkey" FOREIGN KEY ("orden_produccion_id") REFERENCES "orden_produccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_trabajador_id_fkey" FOREIGN KEY ("trabajador_id") REFERENCES "trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_movimiento_inventario" ADD CONSTRAINT "detalle_movimiento_inventario_movimiento_id_fkey" FOREIGN KEY ("movimiento_id") REFERENCES "movimiento_inventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_movimiento_inventario" ADD CONSTRAINT "detalle_movimiento_inventario_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_movimiento_inventario" ADD CONSTRAINT "detalle_movimiento_inventario_almacen_id_fkey" FOREIGN KEY ("almacen_id") REFERENCES "almacen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_movimiento_inventario" ADD CONSTRAINT "detalle_movimiento_inventario_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_movimiento_inventario" ADD CONSTRAINT "detalle_movimiento_inventario_estado_inventario_id_fkey" FOREIGN KEY ("estado_inventario_id") REFERENCES "estado_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
