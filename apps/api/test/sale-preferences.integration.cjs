// npm run build --workspace @torito/api && node apps/api/test/sale-preferences.integration.cjs
// Prueba PostgreSQL únicamente en un esquema temporal de la base local.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { Reflector } = require('@nestjs/core');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { OperationsService } = require('../dist/operations/operations.service');
const { OperationsController } = require('../dist/operations/operations.controller');
const { SaveSalePreferencesDto } = require('../dist/operations/operations.dto');
const { PaymentMethodsService } = require('../dist/payment-methods/payment-methods.service');
const { PermisosGuard } = require('../dist/auth/permisos.guard');
const admin = new PrismaClient();
const schema = `test_sale_preferences_${process.pid}_${Date.now()}`;
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
  const unit = await db.unidadNegocio.create({ data: { codigo: 'TEST', nombre: 'Principal' } });
  const role = await db.role.create({ data: { clave: 'SELLER', nombre: 'Vendedor' } });
  const sellers = [];
  for (const name of ['Ana', 'Luis']) {
    const user = await db.user.create({
      data: {
        name,
        email: `${name}@example.invalid`,
        passwordHash: 'test',
        roleId: role.id,
      },
    });
    const worker = await db.trabajador.create({
      data: {
        userId: user.id,
        unidadNegocioId: unit.id,
        tipoDocumento: 'DNI',
        numeroDocumento: name,
        nombres: name,
        apellidos: 'Prueba',
        cargo: 'Vendedor',
      },
    });
    sellers.push({
      user,
      worker,
      actor: {
        userId: user.id,
        email: user.email,
        name,
        role: 'SELLER',
        rolNombre: 'Vendedor',
        accesoTotal: false,
        administradorPrincipal: false,
        permisos: ['ventas.registrar'],
        trabajadorId: String(worker.id),
        unidadNegocioId: String(unit.id),
      },
    });
  }
  const [ana, luis] = sellers;
  const category = await db.categoriaMetodoPago.create({ data: { nombre: 'Yape' } });
  const global = await db.metodoPago.create({
    data: { categoriaId: category.id, referencia: 'Global' },
  });
  const own = await db.metodoPago.create({
    data: { categoriaId: category.id, trabajadorId: ana.worker.id, referencia: 'Ana' },
  });
  const other = await db.metodoPago.create({
    data: { categoriaId: category.id, trabajadorId: luis.worker.id, referencia: 'Luis' },
  });
  const legacy = await db.metodoPago.create({ data: { referencia: 'Sin categoría' } });
  const service = new OperationsService(db, new PaymentMethodsService(db));
  const get = (seller = ana) => service.salePreferences(seller.actor);
  const save = (id, seller = ana) =>
    service.saveSalePreferences(seller.actor, { metodoPagoId: id === null ? null : String(id) });
  const denied = (promise) => assert.rejects(promise, (error) => error.getStatus?.() === 400);
  assert.deepEqual(await get(), { metodoPagoId: null });
  await save(own.id);
  assert.deepEqual(await get(), { metodoPagoId: String(own.id) });
  assert.deepEqual(
    await get(luis),
    { metodoPagoId: null },
    'Cada vendedor tiene su propia preferencia',
  );
  await denied(save(other.id));
  await denied(save(99999999n));
  await denied(save(legacy.id));
  assert.deepEqual(
    await get(),
    { metodoPagoId: String(own.id) },
    'Un error no cambia la preferencia anterior',
  );
  // Lectura persistida con otro cliente, como en otro dispositivo o después de iniciar sesión.
  const second = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    assert.deepEqual(
      await new OperationsService(second, new PaymentMethodsService(second)).salePreferences(
        ana.actor,
      ),
      { metodoPagoId: String(own.id) },
    );
  } finally {
    await second.$disconnect();
  }
  await db.metodoPago.update({ where: { id: own.id }, data: { estado: false } });
  assert.deepEqual(await get(), { metodoPagoId: null });
  await denied(save(own.id));
  await db.metodoPago.update({ where: { id: own.id }, data: { estado: true } });
  await db.categoriaMetodoPago.update({ where: { id: category.id }, data: { estado: false } });
  assert.deepEqual(await get(), { metodoPagoId: null });
  await denied(save(global.id));
  await db.categoriaMetodoPago.update({ where: { id: category.id }, data: { estado: true } });
  await db.metodoPago.update({ where: { id: own.id }, data: { trabajadorId: luis.worker.id } });
  assert.deepEqual(
    await get(),
    { metodoPagoId: null },
    'No usa un método reasignado a otra persona',
  );
  await save(global.id);
  await save(other.id, luis);
  assert.deepEqual(await get(), { metodoPagoId: String(global.id) });
  await db.trabajador.update({ where: { id: ana.worker.id }, data: { estado: false } });
  assert.deepEqual(await get(), { metodoPagoId: null });
  await denied(save(global.id));
  await save(null);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: ana.user.id } })).metodoPagoVentaId,
    null,
  );
  await db.metodoPago.delete({ where: { id: other.id } });
  assert.deepEqual(
    await get(luis),
    { metodoPagoId: null },
    'Eliminar el método limpia la referencia',
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: luis.user.id } })).metodoPagoVentaId,
    null,
  );

  for (const method of ['salePreferences', 'saveSalePreferences']) {
    const context = (actor) => ({
      getClass: () => OperationsController,
      getHandler: () => OperationsController.prototype[method],
      switchToHttp: () => ({ getRequest: () => ({ user: actor }) }),
    });
    const guard = new PermisosGuard(new Reflector());
    assert.equal(
      guard.canActivate(context(ana.actor)),
      true,
      'No requiere permisos de administración',
    );
    assert.throws(
      () => guard.canActivate(context({ ...ana.actor, permisos: ['ventas.ver'] })),
      (error) => error.getStatus?.() === 403,
    );
  }
  for (const metodoPagoId of [null, '1', '123456789012345678']) {
    assert.equal(
      (await validate(plainToInstance(SaveSalePreferencesDto, { metodoPagoId }))).length,
      0,
    );
  }
  for (const payload of [
    {},
    { metodoPagoId: 1 },
    { metodoPagoId: '' },
    { metodoPagoId: '0' },
    { metodoPagoId: '-1' },
    { metodoPagoId: 'abc' },
    { metodoPagoId: '9999999999999999999' },
  ]) {
    assert.ok((await validate(plainToInstance(SaveSalePreferencesDto, payload))).length > 0);
  }
  console.log(
    'OK: preferencia personal persistente, métodos propios/globales, inactivos/reasignados, quitar preferencia, eliminación, permisos de vendedor y validación.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (db) await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  });
