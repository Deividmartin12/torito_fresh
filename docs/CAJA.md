# Caja y saldos por método de pago

En **Caja y cuentas → Caja**, cada unidad y método de pago tiene su propia cuenta.
El saldo es el registrado por la aplicación; no consulta bancos ni Yape.

## Inicio del control

1. Entra como administrador o con `caja.ajustar` y pulsa **Inicializar cuenta**.
2. Elige el día de apertura e ingresa lo que había **al inicio de ese día**, antes de sus movimientos.
3. Se incorporan una sola vez sus cobros confirmados y gastos con método desde ese día.
   Los movimientos anteriores ya están incluidos en el saldo inicial. Los registros nocturnos
   se incorporan con su fecha efectiva. Las fechas de cobranzas sin hora del formulario antiguo
   se interpretan como el día calendario de Lima, conservando el registro original.

La apertura solo se realiza una vez. Para corregirla, usa **Ajustar saldo** con un motivo.
Si otra operación modificó la cuenta, se pide revisar el saldo actualizado antes de guardar.
El ajuste guarda la diferencia; no reemplaza movimientos anteriores.

## Registro y revisión en Caja

El resumen muestra el **saldo registrado actual**, las cuentas inicializadas, las pendientes
y la última actualización. El historial empieza en **Hoy** y sus filtros no cambian ese saldo.
Cada tarjeta permite **Registrar movimiento**, **Ajustar saldo** o **Ver movimientos**, según
los permisos y el estado de la cuenta. Los movimientos de cuentas inactivas siguen disponibles
para consulta. La información de apertura e ingresos/salidas desde la apertura se puede desplegar.

Para registrar dinero, elige **Ingreso** (aporte o depósito externo) o **Retiro**, ingresa el
importe y explica el motivo. Se admiten coma o punto decimal, hasta dos decimales, sin separadores
de miles. El formulario muestra una estimación del saldo resultante. La fecha efectiva está
en **Cambiar fecha efectiva**; vacía significa el momento actual. Las fechas usan la hora de Lima.
Las transferencias muestran origen, destino y la estimación en ambas cuentas.

En **Ajustar saldo**, ingresa el dinero real que tienes: se comparan el saldo registrado, el real
y la diferencia. Si coinciden, no hace falta guardar. Si otra operación cambió el saldo mientras
revisabas, conserva tus datos, actualiza la comparación y pulsa **Revisé el saldo actualizado**
antes de volver a guardar. No se crean registros de revisión ni cierres diarios.

Un reintento con los mismos datos conserva su identidad para evitar duplicados. Si corriges los
datos del envío, utiliza una identidad nueva. Los errores conservan lo escrito. Después de guardar
se confirma la operación con cuenta e importe y se actualizan los saldos y el historial.

## Movimientos

- **Cobros:** los pagos confirmados de ventas, incluidos pagos mixtos y cobranzas posteriores.
  Una venta a crédito sin cobro no ingresa dinero.
- **Gastos:** los confirmados con método restan de su cuenta. Los gastos nuevos del formulario
  normal exigen método. Los gastos sin método se muestran en un bloque aparte.
- **Carga diaria:** sus ventas ingresan mediante los cobros que genera. No se suman sus totales
  otra vez. Su formulario y sus gastos sin método se conservan.
- **Reembolsos:** restan del método registrado. Una devolución que deja saldo a favor del cliente
  no descuenta dinero hasta un reembolso real.
- **Aportes, depósitos, retiros y transferencias:** requieren `caja.movimientos` y cuentas abiertas.
  Para transferir entre unidades se exige acceso a ambas. Pueden dejar un saldo negativo y un aviso.
- **Correcciones:** mantienen el historial con reversiones y nuevas entradas, incluso si al editar
  una venta se eliminan sus cobros iniciales originales.

Los filtros cambian el historial y sus totales, no el saldo actual. El saldo acumulado por fila
incluye todos los tipos de movimiento hasta su fecha. Las tarjetas muestran ingresos y salidas
desde la apertura; estos incluyen reversiones y transferencias y no son totales de ventas/gastos.

La API requiere un UUID `operacionId` para movimientos manuales, transferencias y ajustes.
Reintentar con la misma identidad devuelve el resultado original sin aplicarlo nuevamente;
cambiar sus datos requiere una identidad nueva. Los asientos automáticos se concilian por fuente.
Las escrituras financieras y sus asientos se confirman en la misma transacción.

## Permisos y actualización

`caja.ver` permite consultar, `caja.movimientos` permite mover dinero y `caja.ajustar` permite
abrir/ajustar. El administrador tiene acceso. Otros roles necesitan asignación explícita en
**Configuración → Roles y permisos**. El alcance sigue siendo el de sus unidades autorizadas.

La migración `20261003120000_caja` crea tablas vacías. No asigna aperturas ni métodos a gastos
históricos. Debe publicarse con la API y la web; Docker Compose ejecuta la migración antes de
arrancar la API. Después de publicar los cambios en el repositorio, en la VPS:

```bash
cd ~/torito_fresh
mkdir -p backups
docker compose exec -T db sh -ec 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "backups/antes-caja-$(date +%Y%m%d-%H%M%S).sql.gz"
bash deploy.sh
docker compose ps
docker compose logs --tail=100 migrate api
```

Comprueba que `migrate` terminó con código 0 y que la API/web responden. Entra a Caja e inicializa
cada cuenta con su saldo real al inicio del día elegido. No hay cierres ni conteos obligatorios.

## Verificación local

```bash
npm run build --workspace @torito/api
node --test apps/api/test/*.test.cjs
node apps/api/test/caja.integration.cjs
node apps/api/test/carga-diaria.integration.cjs
node apps/api/test/ventas-pendientes.integration.cjs
node --test apps/web/test/caja-form.test.cjs
npm run build --workspace @torito/web
```

La prueba de Caja crea y elimina un esquema PostgreSQL aislado en una base local. Cubre apertura,
importación, fechas Lima, pagos, crédito, mixtos, reembolsos, saldo a favor, correcciones,
separación por unidades, ajustes obsoletos, reintentos, concurrencia y Carga diaria.
