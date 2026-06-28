# tORITO FRESH - Sistema administrativo

Sistema web para gestionar clientes, pedidos, ventas, repartos, envases retornables, cobranzas, inventario y reportes de una empresa de venta de vidones de agua.

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

- Frontend: http://localhost:3000
- Backend: http://localhost:4000
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
- Dashboard y reportes administrativos basicos.

No incluye ecommerce, facturacion SUNAT ni app movil.
