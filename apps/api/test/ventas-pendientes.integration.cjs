// npm run build --workspace @torito/api && node apps/api/test/ventas-pendientes.integration.cjs
// Crea y elimina un esquema PostgreSQL aislado; nunca modifica los registros de la aplicación.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { OperationsService } = require('../dist/operations/operations.service');
const { ProductionService } = require('../dist/production/production.service');
const { PaymentMethodsService } = require('../dist/payment-methods/payment-methods.service');
const { ReportsService } = require('../dist/reports/reports.service');
const { CargaDiariaService } = require('../dist/carga-diaria/carga-diaria.service');
const { ensureAvailableState } = require('../dist/common/stock');
const admin = new PrismaClient();
const schema = `test_ventas_pendientes_${process.pid}_${Date.now()}`;
let db;

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Solo PostgreSQL local');
  url.searchParams.set('schema', schema);
  const push = spawnSync(
    process.execPath,
    [
      require.resolve('prisma/build/index.js'),
      'db',
      'push',
      '--schema',
      'packages/database/prisma/schema.prisma',
      '--skip-generate',
    ],
    {
      env: { ...process.env, DATABASE_URL: url.toString() },
      encoding: 'utf8',
    },
  );
  assert.equal(push.status, 0, 'No se pudo crear el esquema aislado de pruebas');
  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const unit = await db.unidadNegocio.create({ data: { codigo: 'TEST', nombre: 'Prueba' } });
  const role = await db.role.create({ data: { clave: 'TEST', nombre: 'Prueba' } });
  const user = await db.user.create({
    data: { name: 'Prueba', email: 'test@example.invalid', passwordHash: 'test', roleId: role.id },
  });
  const worker = await db.trabajador.create({
    data: {
      userId: user.id,
      unidadNegocioId: unit.id,
      tipoDocumento: 'DNI',
      numeroDocumento: 'TEST',
      nombres: 'Prueba',
      apellidos: 'Stock',
      cargo: 'Prueba',
    },
  });
  const actor = {
    userId: user.id,
    email: user.email,
    name: 'Prueba',
    role: role.clave,
    rolNombre: role.nombre,
    accesoTotal: false,
    permisos: ['cargaDiaria.registrar'],
    trabajadorId: String(worker.id),
    unidadNegocioId: String(unit.id),
  };
  const warehouse = await db.almacen.create({
    data: { codigo: 'TEST1', nombre: 'Principal', unidadNegocioId: unit.id },
  });
  const other = await db.almacen.create({
    data: { codigo: 'TEST2', nombre: 'Otro', unidadNegocioId: unit.id },
  });
  const type = await db.tipoProducto.create({ data: { nombre: 'Bidón' } });
  const category = await db.categoriaMetodoPago.create({ data: { nombre: 'Efectivo' } });
  const method = await db.metodoPago.create({
    data: { categoriaId: category.id, referencia: 'Test' },
  });
  const client = await db.cliente.create({
    data: { nombreLegal: 'Cliente', unidadNegocioId: unit.id },
  });
  const state = await ensureAvailableState(db);
  const operations = new OperationsService(db, new PaymentMethodsService(db));
  const production = new ProductionService(db);
  const reports = new ReportsService(db);
  const carga = new CargaDiariaService(db, operations, production);
  let serial = 0;
  const product = () =>
    db.producto.create({
      data: {
        codigo: `P${++serial}`,
        nombre: `Bidón ${serial}`,
        tipoProductoId: type.id,
        unidadMedida: 'UNIDAD',
        precioVenta: 5,
        costoReferencia: 2,
        esRetornable: true,
      },
    });
  const dto = (p, qty, wh = warehouse) => ({
    clienteId: Number(client.id),
    almacenId: Number(wh.id),
    tipoPago: 'CONTADO',
    pagosIniciales: [{ metodoPagoId: Number(method.id), monto: qty * 5 }],
    items: [{ productoId: Number(p.id), cantidad: qty, precioUnitario: 5 }],
    vaciosDevueltos: 0,
  });
  const sell = (p, qty, wh) => operations.createSale(dto(p, qty, wh), actor);
  const produce = (p, qty, wh = warehouse) =>
    production.create(
      {
        productoId: Number(p.id),
        almacenProductoTerminadoId: Number(wh.id),
        cantidadPlanificada: qty,
        fechaPlanificada: '2026-09-30',
      },
      actor,
    );
  const read = (s) => operations.sale(s.id, actor);
  const stock = async (p, wh = warehouse) =>
    Number(
      (
        await db.stockAlmacen.aggregate({
          where: { productoId: p.id, almacenId: wh.id },
          _sum: { cantidad: true },
        })
      )._sum.cantidad ?? 0,
    );
  const refund = async (s, qty, reintegra = true) =>
    operations.createReturn(
      'venta',
      {
        operacionId: Number(s.id),
        motivo: 'Prueba de devolución',
        items: [
          {
            detalleId: Number((await read(s)).items[0].id),
            cantidad: qty,
            reintegraInventario: reintegra,
          },
        ],
      },
      actor,
    );
  const snapshot = async (s) => ({
    venta: await db.venta.findUnique({
      where: { id: BigInt(s.id) },
      select: { fecha: true, total: true, vaciosRecibidos: true },
    }),
    pagos: await db.pagoCliente.findMany({ where: { cuentaCobrar: { ventaId: BigInt(s.id) } } }),
    envases: await db.containerMovement.findMany(),
  });

  // Stock completo, parcial y costo provisional: al regularizar cambian solo inventario y costo.
  const p = await product();
  await produce(p, 10);
  const complete = await sell(p, 4);
  assert.equal(complete.cantidadPendienteStock, 0);
  const partial = await sell(p, 11);
  assert.equal(partial.cantidadPendienteStock, 5);
  assert.equal(partial.items[0].cantidadPendienteStock, 5);
  assert.equal(await stock(p), 0);
  const before = await snapshot(partial);
  const provisional = await reports.business(actor, '2026-01-01', '2099-12-31');
  assert.equal(provisional.costoProvisional, true);
  assert.equal(provisional.summary.cost, 10); // 5 pendientes × costo de referencia 2; lotes producidos sin insumos = 0.
  await produce(p, 20);
  assert.equal((await read(partial)).cantidadPendienteStock, 0);
  assert.equal(await stock(p), 15);
  assert.deepEqual(await snapshot(partial), before);
  assert.equal((await reports.business(actor, '2026-01-01', '2099-12-31')).summary.cost, 0);

  // El costo pendiente de referencia se sustituye por el costo de los lotes realmente consumidos.
  const costProduct = await product();
  const input = await product();
  await db.stockAlmacen.create({
    data: {
      productoId: input.id,
      almacenId: other.id,
      estadoInventarioId: state.id,
      cantidad: 10,
      costoPromedio: 4,
    },
  });
  const costSale = await sell(costProduct, 5);
  const costRow = async () =>
    (await reports.business(actor, '2026-01-01', '2099-12-31')).topProducts.find(
      (r) => r.id === String(costProduct.id),
    );
  assert.equal((await costRow()).cost, 10);
  const costOrder = await production.create(
    {
      productoId: Number(costProduct.id),
      almacenProductoTerminadoId: Number(warehouse.id),
      cantidadPlanificada: 3,
      fechaPlanificada: '2026-09-30',
      insumos: [{ productoId: Number(input.id), cantidad: 3 }],
    },
    actor,
  );
  assert.equal(costOrder.loteMovido, true);
  assert.equal((await costRow()).cost, 16); // 3 × costo real 4 + 2 × referencia 2.
  await refund(costSale, 2);
  assert.equal((await costRow()).cost, 12); // Cancelar pendientes conserva el costo real de las 3 entregadas.
  await refund(costSale, 3);

  // Prioridad por fecha, entregas parciales y almacén.
  const p2 = await product();
  const newer = await sell(p2, 4);
  const older = await sell(p2, 5);
  await db.venta.update({
    where: { id: BigInt(older.id) },
    data: { fecha: new Date('2026-09-01T17:00:00Z') },
  });
  await produce(p2, 3, other);
  assert.equal((await read(older)).cantidadPendienteStock, 5);
  await produce(p2, 3);
  assert.equal((await read(older)).cantidadPendienteStock, 2);
  assert.equal((await read(newer)).cantidadPendienteStock, 4);
  await produce(p2, 4);
  assert.equal((await read(older)).cantidadPendienteStock, 0);
  assert.equal((await read(newer)).cantidadPendienteStock, 2);
  await produce(p2, 4);
  assert.equal(await stock(p2), 2);

  // Dos unidades con inventario comparten catálogo pero nunca regularizan las ventas de la otra.
  const secondUnit = await db.unidadNegocio.create({
    data: { codigo: 'OTHER', nombre: 'Otra unidad' },
  });
  const secondWarehouse = await db.almacen.create({
    data: { codigo: 'OTHER', nombre: 'Otra unidad', unidadNegocioId: secondUnit.id },
  });
  const separated = await product();
  const separatedSale = await sell(separated, 5);
  await production.create(
    {
      productoId: Number(separated.id),
      almacenProductoTerminadoId: Number(secondWarehouse.id),
      cantidadPlanificada: 5,
      fechaPlanificada: '2026-09-30',
    },
    { ...actor, accesoTotal: true },
    String(secondUnit.id),
  );
  assert.equal((await read(separatedSale)).cantidadPendienteStock, 5);
  assert.equal(await stock(separated, secondWarehouse), 5);
  await produce(separated, 5);

  // Edición antes y después de regularizar: revierte todas las salidas una sola vez.
  const p3 = await product();
  let edited = await sell(p3, 7);
  edited = await operations.updateSale(edited.id, dto(p3, 5), actor);
  assert.equal(edited.cantidadPendienteStock, 5);
  await produce(p3, 3);
  edited = await operations.updateSale(edited.id, dto(p3, 6), actor);
  assert.equal(edited.cantidadPendienteStock, 3);
  await produce(p3, 5);
  edited = await operations.updateSale(edited.id, dto(p3, 4), actor);
  assert.equal(edited.cantidadPendienteStock, 0);
  assert.equal(await stock(p3), 4);
  assert.equal((await snapshot(edited)).pagos.length, 1);
  assert.equal(edited.pagado, 20);

  // Reintegrar cancela primero pendientes; no crea stock ficticio. Sin reintegro se mantiene la obligación.
  const p4 = await product();
  await produce(p4, 3);
  const returned = await sell(p4, 8);
  await refund(returned, 2);
  assert.equal((await read(returned)).cantidadPendienteStock, 3);
  assert.equal(await stock(p4), 0);
  await refund(returned, 4);
  assert.equal((await read(returned)).cantidadPendienteStock, 0);
  assert.equal(await stock(p4), 1);
  await refund(returned, 2);
  assert.equal(await stock(p4), 3);
  const p5 = await product();
  const damaged = await sell(p5, 4);
  await refund(damaged, 4, false);
  assert.equal((await read(damaged)).cantidadPendienteStock, 4);
  await produce(p5, 4);
  assert.equal((await read(damaged)).cantidadPendienteStock, 0);
  assert.equal(await stock(p5), 0);

  // Reservas intactas y devoluciones parciales sucesivas vuelven a sus lotes originales.
  const lots = await product();
  const lot1 = await produce(lots, 2);
  const lot2 = await produce(lots, 3);
  const rows = await db.stockAlmacen.findMany({
    where: { productoId: lots.id },
    orderBy: { id: 'asc' },
  });
  await db.stockAlmacen.update({ where: { id: rows[1].id }, data: { cantidadReservada: 1 } });
  const lotSale = await sell(lots, 5);
  assert.equal(lotSale.cantidadPendienteStock, 1);
  assert.equal(await stock(lots), 1);
  await refund(lotSale, 1); // Cancela pendiente; mantiene la reserva.
  await refund(lotSale, 2);
  await refund(lotSale, 2);
  const restored = await db.stockAlmacen.findMany({
    where: { productoId: lots.id },
    orderBy: { id: 'asc' },
  });
  assert.deepEqual(
    restored.map((r) => Number(r.cantidad)),
    [2, 3],
  );
  assert.equal(Number(restored[1].cantidadReservada), 1);

  // Anular antes/después de regularizar: restaura solo el stock descontado y no reembolsa dos veces.
  for (const settled of [false, true]) {
    const p6 = await product();
    await produce(p6, 2);
    const cancelled = await sell(p6, 5);
    if (settled) await produce(p6, 3);
    await operations.annulSale(cancelled.id, { motivo: 'Prueba anulación' }, actor);
    assert.equal((await read(cancelled)).cantidadPendienteStock, 0);
    assert.equal(await stock(p6), settled ? 5 : 2);
    await assert.rejects(
      operations.annulSale(cancelled.id, { motivo: 'Repetida' }, actor),
      /ya está anulada/,
    );
    const refunds = await db.pagoCliente.findMany({
      where: { cuentaCobrar: { ventaId: BigInt(cancelled.id) }, monto: { lt: 0 } },
    });
    assert.equal(refunds.length, 1);
  }

  // Carga diaria conserva su regla estricta y consume únicamente su propia producción.
  const p7 = await product();
  const pending = await sell(p7, 5);
  const daily = await carga.registrar(
    {
      productoId: Number(p7.id),
      dias: [
        {
          fecha: '2026-09-25',
          producciones: [4, 6],
          ventas: [{ metodoPagoId: Number(method.id), monto: 50 }],
        },
      ],
    },
    actor,
  );
  assert.equal(daily.resultados[0].ok, true, daily.resultados[0].error);
  assert.equal((await read(pending)).cantidadPendienteStock, 5);
  assert.equal(await stock(p7), 0);
  const strict = await carga.registrar(
    {
      productoId: Number(p7.id),
      dias: [{ fecha: '2026-09-26', ventas: [{ metodoPagoId: Number(method.id), monto: 10 }] }],
    },
    actor,
  );
  assert.equal(strict.resultados[0].ok, false);

  // Sin inventario: ningún pendiente ni kardex, mismos cobros y envases.
  const noInventory = await db.unidadNegocio.create({
    data: { codigo: 'NOINV', nombre: 'Puesto', controlaInventario: false },
  });
  const noWarehouse = await db.almacen.create({
    data: { codigo: 'NOINV', nombre: 'Puesto', unidadNegocioId: noInventory.id },
  });
  const noClient = await db.cliente.create({
    data: { nombreLegal: 'Puesto', unidadNegocioId: noInventory.id },
  });
  const adminActor = { ...actor, accesoTotal: true };
  const noSale = await operations.createSale(
    { ...dto(p7, 3, noWarehouse), clienteId: Number(noClient.id) },
    adminActor,
    String(noInventory.id),
  );
  assert.equal(noSale.cantidadPendienteStock, 0);
  assert.equal(noSale.kardexId, null);
  await produce(p7, 5);
  assert.equal((await read(pending)).cantidadPendienteStock, 0);

  // Concurrencia real: ventas comparten stock, producción simultánea y devolución con producción.
  const pc = await product();
  await produce(pc, 5);
  const concurrentSales = await Promise.all([sell(pc, 4), sell(pc, 4)]);
  assert.equal(
    (await Promise.all(concurrentSales.map(read))).reduce(
      (n, s) => n + s.cantidadPendienteStock,
      0,
    ),
    3,
  );
  assert.equal(await stock(pc), 0);
  await Promise.all([produce(pc, 2), produce(pc, 3)]);
  assert.equal(
    (await Promise.all(concurrentSales.map(read))).reduce(
      (n, s) => n + s.cantidadPendienteStock,
      0,
    ),
    0,
  );
  assert.equal(await stock(pc), 2);
  for (const s of concurrentSales) assert.equal((await snapshot(s)).pagos.length, 1);
  const pr = await product();
  const race = await sell(pr, 5);
  await Promise.all([produce(pr, 5), refund(race, 3)]);
  assert.equal((await read(race)).cantidadPendienteStock, 0);
  assert.equal(await stock(pr), 3);
  assert.equal(await db.stockAlmacen.count({ where: { cantidad: { lt: 0 } } }), 0);
  console.log(
    'OK: stock completo/parcial/cero, FIFO, almacenes, costos, edición, devoluciones, anulación, pagos/envases, Carga diaria y concurrencia.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (db) await db.$disconnect();
    assert.match(schema, /^test_ventas_pendientes_\d+_\d+$/);
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
    console.log('Esquema aislado de pruebas eliminado.');
  });

