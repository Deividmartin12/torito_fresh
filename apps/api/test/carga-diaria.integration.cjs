// Desde la raíz: npm run build --workspace @torito/api && node apps/api/test/carga-diaria.integration.cjs
// Usa PostgreSQL local con las migraciones aplicadas. Todos los datos se revierten al terminar.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { RegistrarCargaDiariaDto } = require('../dist/carga-diaria/carga-diaria.dto');
const {
  CargaDiariaService,
  repartirCantidad,
} = require('../dist/carga-diaria/carga-diaria.service');
const { OperationsService } = require('../dist/operations/operations.service');
const { ProductionService } = require('../dist/production/production.service');
const { PaymentMethodsService } = require('../dist/payment-methods/payment-methods.service');

const prisma = new PrismaClient();
const rollback = new Error('ROLLBACK_TEST');
const tag = `CD${Date.now()}`;

async function main() {
  const valido = {
    productoId: 1,
    dias: [
      {
        fecha: '2026-09-21',
        editar: true,
        revision: 'r',
        producciones: [0, 0],
        gastos: [0, 0],
        ventas: [{ metodoPagoId: 1, monto: 0 }],
      },
    ],
  };
  assert.equal((await validate(plainToInstance(RegistrarCargaDiariaDto, valido))).length, 0);
  assert.ok(
    (
      await validate(
        plainToInstance(RegistrarCargaDiariaDto, {
          ...valido,
          dias: [{ ...valido.dias[0], producciones: [-1, 0] }],
        }),
      )
    ).length > 0,
  );
  assert.ok(
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname),
    'Solo se prueba una base local',
  );
  assert.equal(
    repartirCantidad(141, [214, 485]).reduce((a, b) => a + b),
    141,
  );
  assert.throws(() => repartirCantidad(1, [1, 2]), /al menos un bidón/);
  try {
    await prisma.$transaction(
      async (tx) => {
        // Los SAVEPOINT reproducen las transacciones independientes por día del servicio,
        // conservando una transacción exterior que deshace también los casos exitosos.
        const db = new Proxy(tx, {
          get(target, property) {
            if (property !== '$transaction') return target[property];
            return async (callback) => {
              await tx.$executeRawUnsafe('SAVEPOINT carga_test');
              try {
                const result = await callback(tx);
                await tx.$executeRawUnsafe('RELEASE SAVEPOINT carga_test');
                return result;
              } catch (error) {
                await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT carga_test');
                await tx.$executeRawUnsafe('RELEASE SAVEPOINT carga_test');
                throw error;
              }
            };
          },
        });
        const unit = await tx.unidadNegocio.create({ data: { codigo: tag, nombre: tag } });
        const role = await tx.role.create({ data: { clave: tag, nombre: tag } });
        const user = await tx.user.create({
          data: {
            name: tag,
            email: `${tag}@example.invalid`,
            passwordHash: 'test',
            roleId: role.id,
          },
        });
        const worker = await tx.trabajador.create({
          data: {
            userId: user.id,
            unidadNegocioId: unit.id,
            tipoDocumento: 'DNI',
            numeroDocumento: tag,
            nombres: tag,
            apellidos: 'Prueba',
            cargo: 'Prueba',
          },
        });
        const actor = {
          userId: user.id,
          email: user.email,
          name: tag,
          role: role.clave,
          rolNombre: tag,
          accesoTotal: false,
          permisos: ['cargaDiaria.registrar'],
          trabajadorId: String(worker.id),
          unidadNegocioId: String(unit.id),
        };
        const warehouse = await tx.almacen.create({
          data: { codigo: tag, nombre: tag, unidadNegocioId: unit.id },
        });
        const type = await tx.tipoProducto.create({ data: { nombre: tag } });
        const product = await tx.producto.create({
          data: {
            tipoProductoId: type.id,
            codigo: tag,
            nombre: tag,
            unidadMedida: 'UNIDAD',
            precioVenta: 5,
            costoReferencia: 0,
            esRetornable: true,
          },
        });
        const category = await tx.categoriaMetodoPago.create({ data: { nombre: tag } });
        const m1 = await tx.metodoPago.create({
          data: { categoriaId: category.id, referencia: '1' },
        });
        const m2 = await tx.metodoPago.create({
          data: { categoriaId: category.id, referencia: '2', trabajadorId: worker.id },
        });
        const operations = new OperationsService(db, new PaymentMethodsService(db));
        const production = new ProductionService(db);
        const service = new CargaDiariaService(db, operations, production);
        const fecha = '2026-09-21';
        const resumen = async (day = fecha) => (await service.resumen(actor, day, day)).dias[0];
        const guardar = async (dia, ok = true) => {
          const result = (
            await service.registrar({ productoId: Number(product.id), dias: [dia] }, actor)
          ).resultados[0];
          assert.equal(result.ok, ok, result.error);
          return result;
        };
        const editar = async (data, ok = true) =>
          guardar({ fecha, editar: true, revision: (await resumen()).revision, ...data }, ok);
        const sales = (a, b) => [
          { metodoPagoId: Number(m1.id), monto: a },
          { metodoPagoId: Number(m2.id), monto: b },
        ];
        const oldOrderId = await production.registrarProduccion(
          tx,
          {
            productoId: Number(product.id),
            cantidadPlanificada: 50,
            fechaPlanificada: '2026-09-20',
          },
          actor,
        );
        const oldOrder = await tx.ordenProduccion.findUniqueOrThrow({ where: { id: oldOrderId } });
        const stock = async (loteId) =>
          Number(
            (await tx.stockAlmacen.aggregate({ where: { loteId }, _sum: { cantidad: true } }))._sum
              .cantidad,
          );
        await guardar({
          fecha,
          producciones: [6, 4],
          ventas: sales(20.01, 10.02),
          gastos: [0.1, 0.2],
        });
        const registros = await tx.registroDiario.findMany({
          where: { unidadNegocioId: unit.id, fecha: new Date(fecha) },
          orderBy: { id: 'asc' },
        });
        const orderId = registros.find((r) => r.concepto === 'PRODUCCION').ordenProduccionId;
        const order = await tx.ordenProduccion.findUniqueOrThrow({ where: { id: orderId } });
        const assertDay = async (cantidad, montos, gasto) => {
          const day = await resumen();
          assert.equal(day.produccion.cantidad, cantidad);
          assert.equal(
            day.ventas.reduce((s, v) => s + v.cantidad, 0),
            cantidad,
          );
          assert.deepEqual(
            day.ventas.map((v) => v.monto),
            montos,
          );
          assert.equal(day.gasto.monto, gasto);
          assert.equal(await stock(order.loteId), 0);
          assert.equal(await stock(oldOrder.loteId), 50, 'La carga no consume otro lote');
          const actuales = await tx.registroDiario.findMany({
            where: { unidadNegocioId: unit.id, fecha: new Date(fecha) },
            orderBy: { id: 'asc' },
          });
          assert.deepEqual(
            actuales.map((r) => r.id),
            registros.map((r) => r.id),
            'No duplica registros',
          );
          const pagos = await tx.pagoCliente.findMany({
            where: { cuentaCobrar: { venta: { unidadNegocioId: unit.id } } },
          });
          assert.equal(
            Math.round(pagos.reduce((s, p) => s + Number(p.monto), 0) * 100),
            Math.round(montos.reduce((a, b) => a + b, 0) * 100),
          );
          assert.ok(pagos.every((p) => p.fechaPago.toISOString().slice(0, 10) === fecha));
          const movimientos = await tx.movimientoInventario.findMany({
            where: {
              OR: [
                { ordenProduccionId: orderId },
                { ventaId: { in: registros.flatMap((r) => (r.ventaId ? [r.ventaId] : [])) } },
              ],
            },
          });
          const lima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' });
          assert.ok(
            movimientos.every((m) => lima.format(m.fecha) === fecha),
            'Kardex en la fecha original de Lima',
          );
          const cliente = await tx.cliente.findFirst({
            where: { unidadNegocioId: unit.id, sistema: true },
          });
          assert.equal(cliente.saldoEnvases, 0);
        };
        await assertDay(10, [20.01, 10.02], 0.3);
        const vieja = (await resumen()).revision;
        await editar({ producciones: [8, 7], ventas: sales(12, 40), gastos: [1, 2] });
        await assertDay(15, [12, 40], 3);
        await guardar({ fecha, editar: true, revision: vieja, producciones: [10, 10] }, false);
        await assertDay(15, [12, 40], 3);
        await editar({ producciones: [2, 3], ventas: sales(30.1, 10.2) });
        await assertDay(5, [30.1, 10.2], 3);
        await editar({ ventas: sales(0, 40), gastos: [0, 0] });
        await assertDay(5, [0, 40], 0);
        await editar({ producciones: [0, 0], ventas: sales(0, 0) });
        await assertDay(0, [0, 0], 0);
        await editar({ producciones: [3, 7], ventas: sales(35, 15) });
        await assertDay(10, [35, 15], 0);
        const revision = (await resumen()).revision;
        await tx.metodoPago.update({ where: { id: m2.id }, data: { estado: false } });
        await editar({ producciones: [20, 10], gastos: [100, 100] }, false);
        assert.equal((await resumen()).revision, revision, 'El fallo revierte toda la corrección');
        await assertDay(10, [35, 15], 0);
        await tx.metodoPago.update({ where: { id: m2.id }, data: { estado: true } });
        await editar({ producciones: [1, 0] }, false);
        await assertDay(10, [35, 15], 0);
        await guardar({ fecha, producciones: [1, 1] }, false);

        // Se puede cargar la venta antes de la producción o agregar otro método después.
        const segundoDia = '2026-09-22';
        await guardar({ fecha: segundoDia, ventas: [{ metodoPagoId: Number(m1.id), monto: 10 }] });
        assert.equal(await stock(oldOrder.loteId), 48);
        await guardar({
          fecha: segundoDia,
          editar: true,
          revision: (await resumen(segundoDia)).revision,
          ventas: [{ metodoPagoId: Number(m1.id), monto: 0 }],
        });
        assert.equal(
          (await resumen(segundoDia)).productoId,
          product.id.toString(),
          'Conserva producto al dejar todas las ventas en cero',
        );
        assert.equal(await stock(oldOrder.loteId), 50);
        await guardar({
          fecha: segundoDia,
          editar: true,
          revision: (await resumen(segundoDia)).revision,
          ventas: [{ metodoPagoId: Number(m1.id), monto: 10 }],
        });
        await guardar({ fecha: segundoDia, producciones: [8, 2] });
        assert.equal(await stock(oldOrder.loteId), 50);
        await guardar({ fecha: segundoDia, ventas: [{ metodoPagoId: Number(m2.id), monto: 20 }] });
        const segundo = await resumen(segundoDia);
        assert.equal(
          segundo.ventas.reduce((s, v) => s + v.cantidad, 0),
          10,
        );
        assert.equal(await stock(oldOrder.loteId), 50);

        // El editor normal de ventas sigue funcionando con su propia transacción y FIFO.
        const cliente = await tx.cliente.findFirstOrThrow({
          where: { unidadNegocioId: unit.id, sistema: true },
        });
        const normalDto = {
          clienteId: Number(cliente.id),
          tipoPago: 'CONTADO',
          pagosIniciales: [{ metodoPagoId: Number(m1.id), monto: 5 }],
          items: [{ productoId: Number(product.id), cantidad: 1, precioUnitario: 5 }],
          vaciosDevueltos: 1,
        };
        const normalId = await operations.registrarVenta(tx, normalDto, actor);
        await operations.updateSale(
          String(normalId),
          {
            ...normalDto,
            pagosIniciales: [{ metodoPagoId: Number(m1.id), monto: 10 }],
            items: [{ productoId: Number(product.id), cantidad: 2, precioUnitario: 5 }],
            vaciosDevueltos: 2,
          },
          actor,
        );
        assert.equal(await stock(oldOrder.loteId), 48);
        console.log(
          'OK: altas, edición, ceros, restauración, lotes, pagos, envases, carga parcial, revisión obsoleta y rollback.',
        );
        throw rollback;
      },
      { isolationLevel: 'Serializable', timeout: 120000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(await prisma.unidadNegocio.count({ where: { codigo: tag } }), 0);
  console.log('OK: todos los datos de prueba fueron revertidos.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
