// npm run build --workspace @torito/api && node apps/api/test/caja.integration.cjs
// PostgreSQL local: crea y elimina únicamente su esquema aislado.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { CajaService } = require('../dist/caja/caja.service');
const { OperationsService } = require('../dist/operations/operations.service');
const { ExpensesService } = require('../dist/expenses/expenses.service');
const { PaymentMethodsService } = require('../dist/payment-methods/payment-methods.service');
const { ProductionService } = require('../dist/production/production.service');
const { CargaDiariaService } = require('../dist/carga-diaria/carga-diaria.service');
const { sincronizarPagoCaja, transaccionCaja } = require('../dist/common/caja-ledger');
const { ensureAvailableState } = require('../dist/common/stock');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { CreateExpenseDto } = require('../dist/expenses/expenses.dto');
const { AperturaCajaDto, AjusteCajaDto, MovimientoCajaDto } = require('../dist/caja/caja.dto');
const { CATALOGO_PERMISOS, expandirPermisos, ROLES_DEL_SISTEMA } = require('../dist/auth/permisos');
const admin = new PrismaClient();
const schema = `test_caja_${process.pid}_${Date.now()}`;
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
    { env: { ...process.env, DATABASE_URL: url.toString() }, encoding: 'utf8' },
  );
  assert.equal(push.status, 0, push.stderr);
  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  await ensureAvailableState(db);
  const unit = await db.unidadNegocio.create({
    data: { codigo: 'CAJA', nombre: 'Principal', principal: true },
  });
  const other = await db.unidadNegocio.create({
    data: { codigo: 'OTRA', nombre: 'Puesto', controlaInventario: false },
  });
  const role = await db.role.create({ data: { clave: 'TEST', nombre: 'Prueba' } });
  const user = await db.user.create({
    data: { name: 'Caja', email: 'caja@example.invalid', passwordHash: 'test', roleId: role.id },
  });
  const worker = await db.trabajador.create({
    data: {
      userId: user.id,
      unidadNegocioId: unit.id,
      tipoDocumento: 'DNI',
      numeroDocumento: 'TEST',
      nombres: 'Caja',
      apellidos: 'Prueba',
      cargo: 'Test',
    },
  });
  const actor = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: role.clave,
    rolNombre: role.nombre,
    accesoTotal: true,
    administradorPrincipal: true,
    permisos: [],
    trabajadorId: String(worker.id),
    unidadNegocioId: String(unit.id),
  };
  const limited = {
    ...actor,
    accesoTotal: false,
    administradorPrincipal: false,
    permisos: ['caja.ver', 'caja.movimientos', 'caja.ajustar'],
  };
  const category = await db.categoriaMetodoPago.create({ data: { nombre: 'Efectivo' } });
  const [m1, m2, m3, m4] = await Promise.all(
    ['1', '2', '3', '4'].map((referencia) =>
      db.metodoPago.create({ data: { categoriaId: category.id, referencia } }),
    ),
  );
  const expenseCategory = await db.categoriaGasto.create({ data: { nombre: 'Servicios' } });
  const wh = await db.almacen.create({
    data: { codigo: 'CAJA', nombre: 'Principal', unidadNegocioId: unit.id },
  });
  const type = await db.tipoProducto.create({ data: { nombre: 'Bidón' } });
  const product = await db.producto.create({
    data: {
      codigo: 'P1',
      nombre: 'Bidón',
      unidadMedida: 'UNIDAD',
      tipoProductoId: type.id,
      precioVenta: 5,
      costoReferencia: 2,
      esRetornable: true,
    },
  });
  const client = await db.cliente.create({
    data: { nombreLegal: 'Cliente', unidadNegocioId: unit.id, limiteCredito: 10000 },
  });
  const caja = new CajaService(db);
  const operations = new OperationsService(db, new PaymentMethodsService(db));
  const expenses = new ExpensesService(db);
  const carga = new CargaDiariaService(db, operations, new ProductionService(db));
  const dto = (monto = 20, method = m1) => ({
    clienteId: Number(client.id),
    almacenId: Number(wh.id),
    tipoPago: 'CONTADO',
    pagosIniciales: [{ metodoPagoId: Number(method.id), monto }],
    items: [{ productoId: Number(product.id), cantidad: 1, precioUnitario: monto }],
    vaciosDevueltos: 0,
  });
  const sell = (data = dto()) => operations.createSale(data, actor, String(unit.id));
  const historicSale = async (date, data = dto()) => {
    const id = await transaccionCaja(db, (tx) =>
      operations.registrarVenta(tx, data, actor, String(unit.id), {
        fecha: date,
        permitirPendiente: true,
      }),
    );
    return operations.sale(String(id), actor, String(unit.id));
  };
  const get = async (method = m1, u = unit) =>
    (await caja.cuentas(actor, String(u.id))).find((a) => a.metodoPagoId === String(method.id));
  const balance = async (value, method = m1, u = unit) =>
    assert.equal((await get(method, u)).saldo, value);
  const opening = (method = m1, u = unit, saldoInicial = 100, fecha = '2026-09-30') =>
    caja.apertura(
      { metodoPagoId: String(method.id), unidadNegocioId: String(u.id), saldoInicial, fecha },
      actor,
    );
  const history = (extra = {}) =>
    caja.movimientos(actor, {
      unidad: String(unit.id),
      from: '2026-09-01',
      to: '2026-10-03',
      ...extra,
    });
  const expense = (monto = 5, method = m1, fecha = '2026-09-30') =>
    expenses.create(
      { fecha, monto, categoriaId: String(expenseCategory.id), metodoPagoId: String(method.id) },
      actor,
      String(unit.id),
    );

  // Apertura con registros antiguos: importación idempotente, corte al inicio del día de Lima.
  const old = await historicSale('2026-09-29', dto(50));
  const paid = await historicSale('2026-09-30', dto(20));
  const pago = await db.pagoCliente.findFirstOrThrow({
    where: { cuentaCobrar: { ventaId: BigInt(paid.id) } },
  });
  await expense(5);
  assert.equal((await get()).saldo, null);
  // Simula fuentes anteriores al despliegue, que todavía no tenían asientos.
  await db.movimientoCaja.deleteMany({ where: { fuenteTipo: { not: null } } });
  await opening();
  await balance(115);
  await assert.rejects(opening(), /ya tiene apertura/);
  const firstCount = await db.movimientoCaja.count();
  await transaccionCaja(db, (tx) => sincronizarPagoCaja(tx, pago.id));
  assert.equal(await db.movimientoCaja.count(), firstCount, 'No duplica una fuente al sincronizar');
  assert.equal(
    await db.movimientoCaja.count({ where: { ventaId: BigInt(old.id) } }),
    0,
    'Anterior a apertura ya está incluido en saldo inicial',
  );
  const fullDay = await history({ from: '2026-09-30', to: '2026-09-30' });
  assert.equal(fullDay.ingresos - fullDay.salidas, 15);
  assert.equal(fullDay.items[0].saldo, 115);
  await caja.movimientos(actor, { unidad: String(unit.id), from: '2026-08-01', to: '2026-08-10' });
  await balance(115);
  await assert.rejects(caja.movimientos(actor, { from: '2026-02-30' }), /fecha/);

  // Un registro nocturno mantiene su día efectivo, aun después de abrir.
  await historicSale('2026-09-30', dto(10));
  await balance(125);
  await sell(dto(20));
  await balance(145);
  await opening(m2, unit, 0);
  await sell({
    ...dto(30),
    pagosIniciales: [
      { metodoPagoId: Number(m1.id), monto: 10 },
      { metodoPagoId: Number(m2.id), monto: 20 },
    ],
  });
  await balance(155);
  await balance(20, m2);
  const credit = await sell({
    ...dto(40),
    tipoPago: 'CREDITO',
    pagosIniciales: [],
    fechaVencimiento: '2026-12-31',
  });
  await balance(155);
  const creditAccount = await db.cuentaCobrar.findUniqueOrThrow({
    where: { ventaId: BigInt(credit.id) },
  });
  await operations.registerAccountPayment(
    {
      cuentaId: Number(creditAccount.id),
      metodoPagoId: Number(m2.id),
      monto: 15,
      fechaPago: '2026-09-30T23:40:00-05:00',
    },
    actor,
    String(unit.id),
  );
  await balance(35, m2);
  assert.equal(
    (await history({ from: '2026-09-30', to: '2026-09-30', cuentaId: (await get(m2)).id }))
      .ingresos,
    15,
    'Cobranza nocturna es del 30 en Lima',
  );

  // Edición cambia método, conserva los cobros borrados y sus reversiones, sin duplicar envases.
  const editable = await sell(dto(12));
  await balance(167);
  const originalPayment = await db.pagoCliente.findFirstOrThrow({
    where: { cuentaCobrar: { ventaId: BigInt(editable.id) } },
  });
  await operations.updateSale(editable.id, dto(18, m2), actor, String(unit.id));
  await balance(155);
  await balance(53, m2);
  assert.equal(await db.pagoCliente.count({ where: { id: originalPayment.id } }), 0);
  assert.equal(
    await db.movimientoCaja.count({ where: { fuenteTipo: 'PAGO', fuenteId: originalPayment.id } }),
    2,
    'El historial sobrevive a eliminar el pago',
  );
  await operations.updateSale(editable.id, dto(18, m2), actor, String(unit.id));
  await balance(53, m2);
  await operations.annulSale(
    editable.id,
    { motivo: 'Reembolso real', metodoPagoId: Number(m1.id) },
    actor,
    String(unit.id),
  );
  await balance(137);
  await balance(53, m2);
  await assert.rejects(
    operations.annulSale(editable.id, { motivo: 'Repetido' }, actor, String(unit.id)),
    /anulada/,
  );
  await balance(137);
  // Una devolución comercial deja saldo a favor, sin salida ficticia de dinero.
  const returned = await sell(dto(9, m2));
  await balance(62, m2);
  const returnedRead = await operations.sale(returned.id, actor, String(unit.id));
  await operations.createReturn(
    'venta',
    {
      operacionId: Number(returned.id),
      motivo: 'Saldo a favor',
      items: [{ detalleId: Number(returnedRead.items[0].id), cantidad: 1 }],
    },
    actor,
    String(unit.id),
  );
  await balance(62, m2);

  // Gastos: creación obligatoria con método, corrección y anulación reversibles en Caja.
  await assert.rejects(
    expenses.create(
      { fecha: '2026-09-30', monto: 5, categoriaId: String(expenseCategory.id) },
      actor,
    ),
    /método/,
  );
  const g = await expense(7);
  await balance(130);
  await expenses.update(g.id, { monto: 8, metodoPagoId: String(m2.id) }, actor, String(unit.id));
  await balance(137);
  await balance(54, m2);
  await expenses.annul(g.id, { motivo: 'Registrado por error' }, actor, String(unit.id));
  await balance(62, m2);
  const cleared = await expense(3, m2);
  await expenses.update(cleared.id, { metodoPagoId: '' }, actor, String(unit.id));
  await balance(62, m2);
  assert.ok((await history()).gastosSinCuenta.items.some((r) => r.id === cleared.id));

  // Movimientos manuales y transferencias: reintentos no crean otra operación.
  const a1 = await get(),
    a2 = await get(m2);
  const manual = {
    cuentaId: a1.id,
    tipo: 'APORTE',
    monto: 10.25,
    motivo: 'Aporte',
    operacionId: randomUUID(),
  };
  await caja.manual(manual, actor);
  await caja.manual(manual, actor);
  await balance(147.25);
  await assert.rejects(caja.manual({ ...manual, monto: 99 }, actor), /diferente/);
  const transfer = {
    origenId: a1.id,
    destinoId: a2.id,
    monto: 20.25,
    motivo: 'Reposición',
    operacionId: randomUUID(),
  };
  const beforeSales = await db.venta.aggregate({ _sum: { total: true } }),
    beforeExpenses = await db.gasto.aggregate({ _sum: { monto: true } });
  await caja.transferir(transfer, actor);
  await caja.transferir(transfer, actor);
  await balance(127);
  await balance(82.25, m2);
  await opening(m1, other, 0);
  const otherAccount = await get(m1, other);
  const cross = { ...transfer, destinoId: otherAccount.id, monto: 5, operacionId: randomUUID() };
  await assert.rejects(caja.transferir(cross, limited), /Cuenta no encontrada/);
  await caja.transferir(cross, actor);
  await balance(122);
  await balance(5, m1, other);
  const limitedAccounts = await caja.cuentas(limited, 'todas');
  assert.ok(limitedAccounts.every((a) => a.unidadNegocioId === String(unit.id)));
  assert.deepEqual(await db.venta.aggregate({ _sum: { total: true } }), beforeSales);
  assert.deepEqual(await db.gasto.aggregate({ _sum: { monto: true } }), beforeExpenses);

  // Ajuste con saldo revisado: una versión antigua no pisa nuevos cobros.
  const reviewed = await get();
  await caja.manual({ ...manual, tipo: 'RETIRO', monto: 200, operacionId: randomUUID() }, actor);
  await balance(-78);
  const adjustment = {
    saldoNuevo: 30,
    version: reviewed.version,
    motivo: 'Conteo físico',
    operacionId: randomUUID(),
  };
  await assert.rejects(caja.ajustar(a1.id, adjustment, actor), /El saldo cambió/);
  adjustment.version = (await get()).version;
  await caja.ajustar(a1.id, adjustment, actor);
  await caja.ajustar(a1.id, adjustment, actor);
  await balance(30);
  const latest = await get();
  const competing = await Promise.allSettled(
    [10, 20].map((saldoNuevo) =>
      caja.ajustar(
        a1.id,
        { saldoNuevo, version: latest.version, motivo: 'Simultáneo', operacionId: randomUUID() },
        actor,
      ),
    ),
  );
  assert.equal(competing.filter((r) => r.status === 'fulfilled').length, 1);
  assert.match(competing.find((r) => r.status === 'rejected').reason.message, /El saldo cambió/);
  const beforeConcurrent = (await get()).saldo;
  const simultaneous = { ...manual, monto: 0.1, operacionId: randomUUID() };
  await Promise.all([caja.manual(simultaneous, actor), caja.manual(simultaneous, actor)]);
  await balance(Math.round((beforeConcurrent + 0.1) * 100) / 100);
  // Dos cobros que juntos exceden la deuda: solo uno puede confirmar.
  const concurrentCredit = await sell({
    ...dto(10),
    tipoPago: 'CREDITO',
    pagosIniciales: [],
    fechaVencimiento: '2026-12-31',
  });
  const cc = await db.cuentaCobrar.findUniqueOrThrow({
    where: { ventaId: BigInt(concurrentCredit.id) },
  });
  const race = await Promise.allSettled(
    [1, 2].map(() =>
      operations.registerAccountPayment(
        { cuentaId: Number(cc.id), metodoPagoId: Number(m2.id), monto: 8 },
        actor,
        String(unit.id),
      ),
    ),
  );
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    Number((await db.cuentaCobrar.findUniqueOrThrow({ where: { id: cc.id } })).saldoPendiente),
    2,
  );
  // Apertura concurrente con alta de venta en una cuenta nueva.
  await Promise.all([opening(m3, unit, 10), sell(dto(4, m3))]);
  await balance(14, m3);
  const legacyCredit = await sell({
    ...dto(20),
    tipoPago: 'CREDITO',
    pagosIniciales: [],
    fechaVencimiento: '2026-12-31',
  });
  const legacyAccount = await db.cuentaCobrar.findUniqueOrThrow({
    where: { ventaId: BigInt(legacyCredit.id) },
  });
  await operations.registerAccountPayment(
    {
      cuentaId: Number(legacyAccount.id),
      metodoPagoId: Number(m4.id),
      monto: 6,
      fechaPago: '2026-09-30',
    },
    actor,
    String(unit.id),
  );
  const legacyPago = await db.pagoCliente.findFirstOrThrow({
    where: { cuentaCobrarId: legacyAccount.id },
  });
  assert.equal(legacyPago.fechaPago.toISOString(), '2026-09-30T17:00:00.000Z');
  await db.pagoCliente.update({
    where: { id: legacyPago.id },
    data: { fechaPago: new Date('2026-09-30T00:00:00Z') },
  });
  await db.movimientoCaja.deleteMany({ where: { fuenteTipo: 'PAGO', fuenteId: legacyPago.id } });
  const openings = await Promise.allSettled([opening(m4, unit, 0), opening(m4, unit, 0)]);
  assert.equal(openings.filter((r) => r.status === 'fulfilled').length, 1);
  await balance(6, m4);
  const currentDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  await operations.registerAccountPayment(
    {
      cuentaId: Number(legacyAccount.id),
      metodoPagoId: Number(m4.id),
      monto: 1,
      fechaPago: `${currentDay}T23:59:00-05:00`,
    },
    actor,
    String(unit.id),
  );
  await balance(7, m4); // Confirmados de hoy se incluyen aunque la hora sea una referencia del día.
  assert.equal(
    (await history({ cuentaId: (await get(m4)).id, from: '2026-09-30', to: '2026-09-30' }))
      .ingresos,
    6,
  );

  // Carga diaria conserva gastos sin método; sus ventas suman por los pagos, una sola vez.
  const dailyBefore = (await get(m2)).saldo;
  const load = (day) =>
    carga.registrar({ productoId: Number(product.id), dias: [day] }, actor, String(unit.id));
  const daily = await load({
    fecha: '2026-09-30',
    producciones: [1, 1],
    ventas: [{ metodoPagoId: Number(m2.id), monto: 10 }],
    gastos: [1, 2],
  });
  assert.equal(daily.resultados[0].ok, true, daily.resultados[0].error);
  await balance(dailyBefore + 10, m2);
  const dailyExpense = await db.gasto.findFirstOrThrow({
    where: { categoria: { nombre: 'Gastos del día' } },
  });
  assert.equal(dailyExpense.metodoPagoId, null);
  assert.equal(
    await db.movimientoCaja.count({ where: { fuenteTipo: 'GASTO', fuenteId: dailyExpense.id } }),
    0,
  );
  assert.ok(
    (await history()).gastosSinCuenta.items.some(
      (g) => g.id === String(dailyExpense.id) && g.origen === 'Carga diaria',
    ),
  );
  const revision = (await carga.resumen(actor, '2026-09-30', '2026-09-30', String(unit.id))).dias[0]
    .revision;
  const changed = await load({
    fecha: '2026-09-30',
    editar: true,
    revision,
    ventas: [{ metodoPagoId: Number(m2.id), monto: 12 }],
    gastos: [2, 3],
  });
  assert.equal(changed.resultados[0].ok, true, changed.resultados[0].error);
  await balance(dailyBefore + 12, m2);
  assert.equal(
    Number((await db.gasto.findUniqueOrThrow({ where: { id: dailyExpense.id } })).monto),
    5,
  );
  assert.equal(
    await db.movimientoCaja.count({ where: { fuenteTipo: 'GASTO', fuenteId: dailyExpense.id } }),
    0,
  );

  // DTO y catálogo: la excepción de carga diaria no habilita gastos normales sin método.
  assert.ok(
    (
      await validate(
        plainToInstance(CreateExpenseDto, {
          fecha: '2026-09-30',
          monto: 1,
          categoriaId: String(expenseCategory.id),
        }),
      )
    ).some((e) => e.property === 'metodoPagoId'),
  );
  assert.ok(
    (
      await validate(
        plainToInstance(AperturaCajaDto, {
          metodoPagoId: '1',
          fecha: '2026-09-30',
          saldoInicial: 1.001,
        }),
      )
    ).length,
  );
  assert.ok(
    (await validate(plainToInstance(MovimientoCajaDto, { ...manual, motivo: '  ' }))).length,
  );
  assert.equal(
    (await validate(plainToInstance(AjusteCajaDto, { ...adjustment, saldoNuevo: -1 }))).length,
    0,
  );
  const keys = CATALOGO_PERMISOS.flatMap((g) => g.permisos.map((p) => p.clave));
  assert.ok(['caja.ver', 'caja.movimientos', 'caja.ajustar'].every((k) => keys.includes(k)));
  assert.ok(expandirPermisos(['caja.movimientos']).includes('caja.ver'));
  for (const r of ROLES_DEL_SISTEMA.filter((r) => !r.accesoTotal))
    assert.ok(
      !r.permisos.some((p) => p.startsWith('caja.')),
      'Asignación explícita para roles limitados',
    );
  console.log(
    'OK: apertura/importación, fechas Lima, contado, crédito, mixtos, cobranza, reversión, reembolso, saldo a favor, gastos, transferencias, ajustes, permisos, concurrencia y carga diaria.',
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (db) await db.$disconnect();
    assert.match(schema, /^test_caja_\d+_\d+$/);
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  });
