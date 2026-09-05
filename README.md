# Torito Fresh — Sistema administrativo

Sistema web para gestionar el ciclo completo de una empresa productora y distribuidora de bidones
de agua: gastos, producción, inventario, distribución, ventas, cobranzas y reutilización de
envases retornables.

Flujo central:

```text
Registro de gastos → Comparativa con ventas → Producción y envasado → Producto terminado
→ Distribución → Venta y cobro → Retorno de envases → Lavado → Reutilización
```

## Estructura

```text
apps/
  api/      Backend NestJS modular (puerto 4070)
  web/      Frontend Next.js + Tailwind CSS (puerto 3070)
packages/
  database/ Prisma schema, constraints y seed
deploy/
  windows/  Scripts para dejar la app corriendo en la PC del negocio
```

## Requisitos

- Node.js 20 o superior
- PostgreSQL 16 o superior
- npm

---

# Ejecutar en tu máquina (desarrollo)

## 1. Crear la base de datos

```bash
createdb torito_fresh
# o, si prefieres psql:
psql -U postgres -c "CREATE DATABASE torito_fresh;"
```

## 2. Configurar las variables de entorno

Son **dos** archivos. Next.js solo lee los `.env` que están dentro de `apps/web`, así que el de
la raíz no le llega: sin el segundo archivo, la web queda apuntando fijo a `localhost:4070`.

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

Edita `.env` y completa:

| Variable | Qué es |
|---|---|
| `DATABASE_URL` | `postgresql://usuario:clave@localhost:5432/torito_fresh?schema=public` |
| `JWT_SECRET` | Cadena larga y aleatoria. Genérala con `openssl rand -base64 48` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4070` |
| `WEB_ORIGIN` | `http://localhost:3070` (orígenes permitidos por CORS, separados por coma) |

Los archivos `.env` **nunca** se suben a git: `.gitignore` los excluye a todos y solo deja pasar
los `.env.example`. Si `JWT_SECRET` falta o es muy corto, la API se niega a arrancar con un
mensaje claro, en vez de firmar tokens con un secreto por defecto.

## 3. Instalar y preparar la base

```bash
npm install
npm run db:generate   # genera el cliente de Prisma
npm run db:push       # crea/actualiza las tablas y aplica las constraints
npm run db:seed       # usuarios iniciales y catálogos
```

## 4. Levantar la app

En **dos terminales**:

```bash
npm run dev:api   # backend  → http://localhost:4070
npm run dev:web   # frontend → http://localhost:3070
```

Entra a **http://localhost:3070**.

## Usuarios iniciales (seed)

| Usuario | Clave | Rol |
|---|---|---|
| `admin` | `admin` | Administrador |
| `01` | `01` | Reparto |
| `02` | `02` | Reparto |

Se puede iniciar sesión con el usuario o con el correo (`<usuario>@toritofresh.local`).
**Cámbialas apenas entres la primera vez**: son solo para arrancar.

## Comandos útiles

| Comando | Para qué |
|---|---|
| `npm run dev:api` / `npm run dev:web` | Levantar en modo desarrollo |
| `npm run build` | Compilar backend y frontend para producción |
| `npm run db:push` | Sincronizar el esquema + aplicar las constraints |
| `npm run db:constraints` | Solo reaplicar las constraints SQL |
| `npm run db:seed` | Recargar usuarios y catálogos iniciales |
| `npm run db:studio` | Abrir Prisma Studio para ver/editar la base |
| `npm run format` | Formatear todo con Prettier |

## Si algo falla

| Síntoma | Causa habitual |
|---|---|
| La API no arranca y habla de `JWT_SECRET` | Falta esa variable en `.env`, o tiene menos de 16 caracteres |
| El navegador dice "No se pudo conectar con el servidor" | La API no está levantada, o `NEXT_PUBLIC_API_URL` apunta a otro puerto |
| Errores de CORS en la consola del navegador | La URL desde la que entras no está en `WEB_ORIGIN` |
| `db:push` falla al conectarse | `DATABASE_URL` con usuario/clave equivocados, o PostgreSQL apagado |
| Cambiaste `NEXT_PUBLIC_API_URL` y no surte efecto | Esa variable se incrusta al compilar: hay que rehacer `npm run build` |

---

# Ejecutar en la PC del negocio (Windows)

La PC receptora levanta sola el backend y el frontend al iniciar sesión. **No abre ningún
navegador**: el usuario entra por su cuenta a `http://localhost:3070`.

Resumen de los pasos (el detalle completo, con el mantenimiento y las notas de red, está en
[`deploy/windows/README-KIOSKO.md`](deploy/windows/README-KIOSKO.md)):

1. **Copiar el código** a `C:\torito_fresh`. Si copias la carpeta a mano, no incluyas
   `node_modules`, `.next`, `dist` ni `.env`: se generan solos en esa PC.
2. **Revisar la clave de PostgreSQL.** `deploy\windows\setup.ps1` asume que el usuario
   `postgres` tiene la clave `123456789` (línea 16, `$PgPassword`). Si es otra, edítala antes.
3. **Instalar**, en PowerShell **como Administrador**:
   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass -Force
   cd C:\torito_fresh\deploy\windows
   .\setup.ps1
   ```
   Crea la base, genera los dos `.env` con un `JWT_SECRET` propio de esa PC, instala
   dependencias, sincroniza el esquema, carga el seed y compila. Si Node no estaba, lo instala
   con `winget` y te pide abrir una PowerShell nueva y repetir el comando.
4. **Probar** con `.\start-kiosk.ps1`. Debe terminar en
   `Todo listo. Abre el navegador en http://localhost:3070`.
5. **Dejarlo automático** con `.\install-autostart.ps1`, y cerrar sesión y volver a entrar.
6. Deja `http://localhost:3070` como página de inicio del navegador y un acceso directo en el
   escritorio, para que el operador solo haga doble clic.

Mantenimiento: `.\stop-kiosk.ps1` baja los servicios y `.\start-kiosk.ps1` los vuelve a levantar.

---

## Módulos

- **Gastos** — registro de gastos con proveedor y comprobante, categorías y filtros.
- **Producción** — órdenes de producción y lotes generados al completarlas.
- **Ventas** — clientes, ventas al contado/crédito/mixto, frecuencia de recarga y devoluciones
  comerciales.
- **Distribución** — retorno de envases retornables y control de bidones rotos.
- **Inventario** — productos e insumos, almacenes y Kardex de movimientos.
- **Caja y cuentas** — cobranzas con pagos parciales y métodos de pago.
- **Reportes** — resumen diario, ventas, gastos y stock actual.
- **Configuración** — trabajadores, con autenticación JWT y permisos por rol.

Los lotes se consumen siempre **FIFO**: la venta no elige lote, sale primero el más antiguo y una
misma línea puede repartirse entre varios lotes. El Kardex es un registro de solo-append: editar
una venta no borra el movimiento anterior, genera una reversión y una salida nueva.

No incluye ecommerce, facturación SUNAT ni app móvil.
