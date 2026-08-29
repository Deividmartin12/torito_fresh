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
- PostgreSQL 16+ local
- npm

## Puesta en marcha

```bash
cp ".env copy.example" .env      # editar DATABASE_URL con tu usuario/clave de Postgres
createdb torito_fresh            # o: psql -c "CREATE DATABASE torito_fresh;"
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
- PostgreSQL: localhost:5432

Usuarios iniciales (seed):

- `admin` / `admin` (administrador)
- `01` / `01` y `02` / `02` (reparto)

Se puede iniciar sesión con el usuario o con el correo (`<usuario>@toritofresh.local`).

## Modo kiosko (Windows)

Para dejar una PC que al iniciar sesión abra sola la app a pantalla completa en
`http://localhost:3070`, ver [`deploy/windows/README-KIOSKO.md`](deploy/windows/README-KIOSKO.md).

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
