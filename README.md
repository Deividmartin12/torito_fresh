# tORITO FRESH - Sistema administrativo

Sistema web para gestionar el ciclo completo de una empresa productora y distribuidora de bidones de agua: abastecimiento, producción, inventario, distribución, ventas, cobranzas y reutilización de envases retornables.

Flujo central:

```text
Registro de gastos → Comparativa con ventas → Producción y envasado → Producto terminado
→ Distribución → Venta y cobro → Retorno de envases → Lavado → Reutilización
```

## Estructura

```text
apps/
  api/      Backend NestJS modular
  web/      Frontend Next.js + Tailwind CSS
packages/
  database/ Prisma schema y seed
```

## Requisitos

- Node.js 20+
- Docker Desktop o PostgreSQL local
- npm

## Puesta en marcha

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev:api
npm run dev:web
```

Servicios por defecto:

- Frontend: http://localhost:3070
- Backend: http://localhost:4070
- PostgreSQL: localhost:55432

Usuario inicial:

- Email: admin@toritofresh.local
- Password: Admin12345

## Alcance implementado

- Autenticacion con JWT, roles y usuarios activos/inactivos.
- CRUD funcional de clientes, productos y pedidos.
- Entrega de pedidos con registro de envases entregados/devueltos.
- Venta automatica al entregar, descuento de stock y deuda si el pago es parcial.
- Cobranzas con pagos parciales.
- Inventario de productos y envases vacios.
- Ordenes de produccion con consumo de insumos y envases limpios.
- Generacion de lote y producto terminado al completar produccion.
- Registro de merma, costo producido y Kardex de transformacion.
- Inventarios separados por etapa: materia prima, producto terminado y envases.
- Retorno de envases separado de las devoluciones comerciales.
- Dashboard y reportes administrativos basicos.

No incluye ecommerce, facturacion SUNAT ni app movil.
