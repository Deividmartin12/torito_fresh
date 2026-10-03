const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { Reflector } = require('@nestjs/core');
const { permisosEnUnidad } = require('../dist/auth/permisos-unidad');
const { AuthService } = require('../dist/auth/auth.service');
const { JwtStrategy } = require('../dist/auth/jwt.strategy');
const { PermisosGuard } = require('../dist/auth/permisos.guard');
const { UnidadesController } = require('../dist/unidades/unidades.controller');
const { OperationsController } = require('../dist/operations/operations.controller');
const { ExpensesController } = require('../dist/expenses/expenses.controller');
const { UsersController } = require('../dist/users/users.controller');
const { UsersService } = require('../dist/users/users.service');
const { TrabajadoresService } = require('../dist/trabajadores/trabajadores.service');
const { RolesService } = require('../dist/roles/roles.service');
const { RolesController } = require('../dist/roles/roles.controller');
const { PaymentMethodsController } = require('../dist/payment-methods/payment-methods.controller');
const { UnidadesService } = require('../dist/unidades/unidades.service');
const { ExpensesService } = require('../dist/expenses/expenses.service');
const { OperationsService } = require('../dist/operations/operations.service');
const { ClientsService } = require('../dist/clients/clients.service');
const { ReportsService } = require('../dist/reports/reports.service');
const { PaymentMethodsService } = require('../dist/payment-methods/payment-methods.service');
const { resolverTrabajadorAutor } = require('../dist/common/worker-context');
const {
  resolverAlcanceUnidad,
  resolverUnidadDeEscritura,
  exigirMismaUnidad,
} = require('../dist/common/unit-context');

const rolTotal = {
  clave: 'ADMIN',
  nombre: 'Administrador',
  estado: true,
  accesoTotal: true,
  permisos: [],
};
const actor = (inventario = false, principal = false) => ({
  userId: 'cuenta-prueba',
  email: 'prueba@example.test',
  name: 'Operador',
  role: 'ADMIN',
  rolNombre: 'Administrador',
  trabajadorId: '22',
  unidadNegocioId: '2',
  controlaInventario: inventario,
  administradorPrincipal: principal,
  ...permisosEnUnidad(rolTotal, inventario, principal),
});
const status = (codigo) => (error) => error.getStatus?.() === codigo;
const contexto = (Controller, accion, usuario) => ({
  getClass: () => Controller,
  getHandler: () => Controller.prototype[accion],
  switchToHttp: () => ({ getRequest: () => ({ user: usuario }) }),
});

// Dos negocios con cifras distintas: los reportes deben devolver exactamente las de la
// unidad 2, aunque se pida "todas", otra unidad o exista una preferencia antigua ajena.
function datosPrueba() {
  const unidades = [
    { id: 1n, nombre: 'Principal', estado: true, principal: true, controlaInventario: true },
    { id: 2n, nombre: 'Independiente', estado: true, principal: false, controlaInventario: false },
  ];
  const trabajadores = unidades.map((unidad) => ({
    id: unidad.id === 2n ? 22n : 11n,
    unidadNegocioId: unidad.id,
    estado: true,
    userId: unidad.id === 2n ? 'cuenta-prueba' : 'otra-cuenta',
    nombres: unidad.nombre,
    apellidos: 'Operador',
    cargo: 'Vendedor',
  }));
  const clientes = unidades.map((unidad) => ({
    id: unidad.id,
    unidadNegocioId: unidad.id,
    nombreLegal: `Cliente ${unidad.nombre}`,
    limiteCredito: null,
    estado: true,
    sistema: false,
    createdAt: new Date('2026-09-15T17:00:00Z'),
  }));
  const ventas = unidades.map((unidad, i) => ({
    id: unidad.id,
    unidadNegocioId: unidad.id,
    unidadNegocio: unidad,
    clienteId: unidad.id,
    cliente: clientes[i],
    almacenOrigenId: unidad.id,
    almacenOrigen: { nombre: unidad.nombre },
    trabajadorId: trabajadores[i].id,
    trabajador: trabajadores[i],
    total: unidad.id === 2n ? 100 : 9000,
    subtotal: 100,
    montoInicial: 0,
    tipoPago: 'CREDITO',
    metodoPagoInicialId: null,
    estado: 'CONFIRMADA',
    fecha: new Date('2026-09-15T17:00:00Z'),
    detalles: [],
    devoluciones: [],
    movimientosInventario: [],
  }));
  const gastos = unidades.map((unidad, i) => ({
    id: unidad.id,
    unidadNegocioId: unidad.id,
    unidadNegocio: unidad,
    categoriaId: 5n,
    categoria: { nombre: 'Servicios' },
    estado: 'CONFIRMADO',
    monto: unidad.id === 2n ? 30 : 5000,
    trabajadorId: trabajadores[i].id,
    trabajador: trabajadores[i],
    beneficiarioId: null,
    fecha: new Date('2026-09-15T00:00:00Z'),
    createdAt: new Date('2026-09-15T17:00:00Z'),
  }));
  const cuentas = unidades.map((unidad, i) => ({
    id: unidad.id,
    clienteId: unidad.id,
    cliente: clientes[i],
    venta: ventas[i],
    saldoPendiente: unidad.id === 2n ? 20 : 8000,
    montoPagado: 0,
    fechaVencimiento: null,
    estado: 'PENDIENTE',
    pagos: [],
  }));
  function coincide(fila, where = {}) {
    return Object.entries(where).every(([key, valor]) => {
      if (valor === undefined) return true;
      if (key === 'OR') return valor.some((condicion) => coincide(fila, condicion));
      const dato = fila[key];
      if (valor instanceof Date) return dato?.getTime() === valor.getTime();
      if (valor && typeof valor === 'object') {
        if ('in' in valor && !valor.in.includes(dato)) return false;
        if ('not' in valor && dato === valor.not) return false;
        if ('gt' in valor && !(dato > valor.gt)) return false;
        if ('gte' in valor && !(dato >= valor.gte)) return false;
        if ('lt' in valor && !(dato < valor.lt)) return false;
        if ('lte' in valor && !(dato <= valor.lte)) return false;
        if (!['in', 'not', 'gt', 'gte', 'lt', 'lte'].some((op) => op in valor)) {
          return dato != null && coincide(dato, valor);
        }
        return true;
      }
      return dato === valor;
    });
  }
  const tabla = (filas) => ({
    findMany: async ({ where } = {}) => filas.filter((fila) => coincide(fila, where)),
    findFirst: async ({ where } = {}) => filas.find((fila) => coincide(fila, where)) ?? null,
    findUnique: async ({ where }) => filas.find((fila) => coincide(fila, where)) ?? null,
    count: async ({ where } = {}) => filas.filter((fila) => coincide(fila, where)).length,
    aggregate: async ({ where, _sum = {} }) => {
      const elegidas = filas.filter((fila) => coincide(fila, where));
      return {
        _count: elegidas.length,
        _sum: Object.fromEntries(
          Object.keys(_sum).map((key) => [
            key,
            elegidas.reduce((total, fila) => total + Number(fila[key] ?? 0), 0),
          ]),
        ),
      };
    },
  });
  return {
    unidadNegocio: tabla(unidades),
    trabajador: tabla(trabajadores),
    cliente: tabla(clientes),
    venta: tabla(ventas),
    gasto: tabla(gastos),
    cuentaCobrar: tabla(cuentas),
    categoriaGasto: tabla([{ id: 5n, nombre: 'Pago a trabajador', sistema: true }]),
    usuarioUnidadVisible: { findMany: async () => [{ unidadNegocioId: 1n }] },
    ordenProduccion: tabla([]),
    producto: tabla([]),
    metodoPago: tabla([]),
    pagoCliente: tabla([]),
    detalleVenta: tabla([]),
    devolucionVenta: tabla([]),
  };
}

test('login, /auth/me y JWT aplican el mismo aislamiento aun con un rol de acceso total', async () => {
  const trabajador = {
    id: 22n,
    cargo: 'Vendedor',
    estado: true,
    unidadNegocioId: 2n,
    unidadNegocio: { id: 2n, nombre: 'Independiente', controlaInventario: false },
  };
  const usuario = {
    id: 'cuenta-prueba',
    email: 'prueba@example.test',
    name: 'Operador',
    username: 'operador',
    active: true,
    administradorPrincipal: false,
    passwordHash: await bcrypt.hash('clave-de-prueba', 4),
    role: rolTotal,
    trabajador,
  };
  const db = { user: { findFirst: async () => usuario, findUnique: async () => usuario } };
  const auth = new AuthService(db, { signAsync: async () => 'token-de-prueba' });
  const login = (await auth.login({ email: 'operador', password: 'clave-de-prueba' })).user;
  const me = await auth.me(usuario.id);
  const jwt = await new JwtStrategy(db, { get: () => 'secreto-solo-para-pruebas' }).validate({
    sub: usuario.id,
  });
  for (const sesion of [login, me, jwt]) {
    assert.equal(sesion.accesoTotal, false);
    assert.equal(sesion.administradorPrincipal, false);
    assert.equal(sesion.controlaInventario, false);
    assert.equal(sesion.unidadNegocioId, '2');
    assert.deepEqual(sesion.permisos, login.permisos);
    assert.ok(sesion.permisos.includes('ventas.registrar'));
    assert.ok(sesion.permisos.includes('gastos.registrar'));
    assert.ok(!sesion.permisos.includes('unidades.elegir'));
  }
  trabajador.estado = false;
  const inactivo = await new JwtStrategy(db, { get: () => 'secreto-solo-para-pruebas' }).validate({
    sub: usuario.id,
  });
  assert.equal(inactivo.accesoTotal, false);
  assert.equal(inactivo.unidadNegocioId, null);
  await assert.rejects(resolverAlcanceUnidad(datosPrueba(), inactivo, 'todas'), status(403));
  trabajador.estado = true;
  usuario.administradorPrincipal = true;
  const principalLogin = (await auth.login({ email: 'operador', password: 'clave-de-prueba' }))
    .user;
  const principalMe = await auth.me(usuario.id);
  const principalJwt = await new JwtStrategy(db, {
    get: () => 'secreto-solo-para-pruebas',
  }).validate({ sub: usuario.id });
  for (const sesion of [principalLogin, principalMe, principalJwt]) {
    assert.equal(sesion.administradorPrincipal, true);
    assert.equal(sesion.accesoTotal, true);
    assert.equal(sesion.rolNombre, 'Administrador principal');
    assert.deepEqual(sesion.permisos, principalLogin.permisos);
    assert.deepEqual(
      await resolverAlcanceUnidad(datosPrueba(), { ...sesion, userId: usuario.id }, 'todas'),
      { tipo: 'todas' },
    );
  }
});

test('el aislamiento limita los permisos del rol sin otorgar capacidades nuevas', () => {
  assert.deepEqual(
    permisosEnUnidad(
      {
        accesoTotal: false,
        permisos: [
          { clave: 'ventas.ver' },
          { clave: 'unidades.elegir' },
          { clave: 'productos.editar' },
        ],
      },
      false,
    ),
    { accesoTotal: false, permisos: ['ventas.ver'] },
  );
});

test('los endpoints globales y de inventario devuelven 403 para una cuenta independiente', () => {
  const guard = new PermisosGuard(new Reflector());
  const restringidas = [
    [UnidadesController, 'list'],
    [UnidadesController, 'guardarVisibles'],
    [UsersController, 'list'],
    [RolesController, 'update'],
    [PaymentMethodsController, 'list'],
    [OperationsController, 'updateProduct'],
    [OperationsController, 'lots'],
    [OperationsController, 'stock'],
    [ExpensesController, 'updateCategory'],
  ];
  for (const [Controller, accion] of restringidas) {
    assert.throws(() => guard.canActivate(contexto(Controller, accion, actor())), status(403));
    assert.equal(guard.canActivate(contexto(Controller, accion, actor(true, true))), true);
  }
  for (const [Controller, accion] of [
    [OperationsController, 'createSale'],
    [ExpensesController, 'create'],
  ]) {
    assert.equal(guard.canActivate(contexto(Controller, accion, actor())), true);
  }
});

test('otra unidad, todas y preferencias antiguas nunca amplían la lectura ni la escritura', async () => {
  const db = datosPrueba();
  const usuario = { ...actor(), accesoTotal: true, permisos: ['unidades.elegir'] };
  for (const solicitada of [undefined, 'todas', '1', '2', 'invalida']) {
    assert.deepEqual(await resolverAlcanceUnidad(db, usuario, solicitada), { tipo: 'una', id: 2n });
    assert.equal(
      await resolverUnidadDeEscritura(db, { actor: usuario, unidadSolicitada: solicitada }),
      2n,
    );
  }
  await assert.rejects(
    resolverAlcanceUnidad(db, { ...usuario, unidadNegocioId: null }, 'todas'),
    status(403),
  );
});

test('solo el administrador principal puede consultar el consolidado y elegir cualquier unidad', async () => {
  const db = datosPrueba();
  assert.deepEqual(permisosEnUnidad(rolTotal, true), permisosEnUnidad(rolTotal, null));
  assert.deepEqual(await resolverAlcanceUnidad(db, actor(true), 'todas'), { tipo: 'una', id: 2n });
  assert.deepEqual(await resolverAlcanceUnidad(db, actor(true, true), 'todas'), { tipo: 'todas' });
  assert.deepEqual(await resolverAlcanceUnidad(db, actor(true, true)), { tipo: 'una', id: 1n });
  assert.equal(
    await resolverUnidadDeEscritura(db, { actor: actor(true, true), unidadSolicitada: '1' }),
    1n,
  );
});

test('el catálogo de unidades devuelve solo la propia y no filtra otras si falta el vínculo', async () => {
  const unidades = new UnidadesService(datosPrueba());
  assert.deepEqual(
    (await unidades.propias(actor())).map((unidad) => unidad.id),
    ['2'],
  );
  assert.deepEqual(await unidades.propias({ ...actor(), unidadNegocioId: null }), []);
  await assert.rejects(unidades.guardarVisibles(actor(), { unidades: [] }), status(403));
});

test('ventas, gastos, clientes y cuentas excluyen los registros de la principal', async () => {
  const db = datosPrueba();
  const gastos = new ExpensesService(db);
  const operaciones = new OperationsService(db, new PaymentMethodsService(db));
  const clientes = new ClientsService(db);
  const rango = ['2026-09-01', '2026-09-30'];
  assert.deepEqual(
    (await gastos.list(actor(), ...rango, undefined, undefined, 'todas')).map(
      (gasto) => gasto.monto,
    ),
    [30],
  );
  assert.deepEqual(
    (await operaciones.sales(actor(), ...rango, undefined, '1')).map((venta) => venta.total),
    [100],
  );
  assert.deepEqual(
    (await clientes.list(actor(), undefined, undefined, '1')).map((cliente) => cliente.id),
    ['2'],
  );
  assert.deepEqual(
    (await operaciones.accounts(actor(), undefined, 'todas')).map((cuenta) => cuenta.id),
    ['2'],
  );
  await assert.rejects(clientes.get('1', actor(), 'todas'), status(404));
  await assert.rejects(operaciones.sale('1', actor(), '1'), status(404));
  await assert.rejects(gastos.update('1', { monto: 1 }, actor(), 'todas'), status(404));
  await assert.rejects(gastos.annul('1', { motivo: 'Prueba' }, actor(), '1'), status(404));
});

test('resumen y reporte por trabajador suman solo las cifras del negocio independiente', async () => {
  const reportes = new ReportsService(datosPrueba());
  const resumen = await reportes.business(actor(), '2026-09-01', '2026-09-30', 'todas');
  assert.equal(resumen.summary.sales, 100);
  assert.equal(resumen.summary.expenses, 30);
  assert.equal(resumen.summary.profit, 70);
  assert.equal(resumen.receivables.total, 20);
  assert.deepEqual(
    resumen.porUnidad.map((unidad) => unidad.id),
    ['2'],
  );
  const trabajadores = await reportes.workers(actor(), '2026-09-01', '2026-09-30', '1');
  assert.deepEqual(
    trabajadores.workers.map((trabajador) => trabajador.id),
    ['22'],
  );
  assert.equal(trabajadores.totals.montoVendido, 100);
  assert.equal(trabajadores.totals.montoGastos, 30);
  const comparativo = await reportes.business(actor(), '2026-09-16', '2026-09-30', '1', true);
  assert.equal(comparativo.summary.sales, 0);
  assert.equal(comparativo.previous.sales, 100);
  assert.equal(comparativo.previous.expenses, 30);
  assert.equal(comparativo.previous.profit, 70);
});

test('el catálogo no revela ventas o métodos de pago de otras unidades', async () => {
  const db = datosPrueba();
  const operaciones = new OperationsService(db, new PaymentMethodsService(db));
  db.producto.findMany = async (consulta) => {
    assert.deepEqual(consulta.include._count.select.detallesVenta.where, {
      venta: { unidadNegocioId: 2n },
    });
    return [];
  };
  await operaciones.products(actor(), 'todas');
  db.categoriaMetodoPago = {
    findMany: async (consulta) => {
      assert.deepEqual(consulta.include._count.select.metodos.where, {
        OR: [{ trabajadorId: null }, { trabajador: { unidadNegocioId: 2n } }],
      });
      return [];
    },
  };
  await operaciones.paymentMethodCategories(actor());
});

test('atribuir operaciones o crear métodos propios no permite seleccionar un trabajador ajeno', async () => {
  const db = datosPrueba();
  assert.equal(await resolverTrabajadorAutor(db, actor(), '22'), 22n);
  await assert.rejects(resolverTrabajadorAutor(db, actor(), '11'), status(400));
  const operaciones = new OperationsService(db, {});
  await assert.rejects(operaciones.paymentMethods(actor(), '11'), status(400));
  await assert.rejects(
    operaciones.createOwnPaymentMethod(actor(), { trabajadorId: '11', categoriaId: '1' }),
    status(400),
  );
  await assert.rejects(resolverTrabajadorAutor(db, actor(true), '11'), status(400));
  assert.equal(await resolverTrabajadorAutor(db, actor(true, true), '11'), 11n);
});

test('pagar a un trabajador de otra unidad no crea ni modifica un gasto independiente', async () => {
  const db = datosPrueba();
  const gastos = new ExpensesService(db);
  await assert.rejects(
    gastos.create(
      {
        fecha: '2026-09-15',
        categoriaId: '5',
        monto: 10,
        beneficiarioId: '11',
      },
      actor(),
      '1',
    ),
    status(400),
  );
  await assert.rejects(
    gastos.update('2', { categoriaId: '5', beneficiarioId: '11' }, actor()),
    status(400),
  );
  const conInventario = datosPrueba();
  const buscarUnidad = conInventario.unidadNegocio.findFirst;
  conInventario.unidadNegocio.findFirst = async (consulta) => {
    const unidad = await buscarUnidad(consulta);
    return unidad ? { ...unidad, controlaInventario: true } : null;
  };
  await assert.rejects(
    new ExpensesService(conInventario).create(
      { fecha: '2026-09-15', categoriaId: '5', monto: 10, beneficiarioId: '11' },
      actor(true),
    ),
    status(400),
  );
});

test('crear un gasto con un parámetro de otra unidad lo guarda en la unidad propia', async () => {
  const db = datosPrueba();
  let guardado;
  db.gasto.create = async ({ data }) => {
    guardado = data;
    return { id: 3n, ...data, categoria: { nombre: 'Pago a trabajador' } };
  };
  await new ExpensesService(db).create(
    {
      fecha: '2026-09-15',
      categoriaId: '5',
      monto: 10,
      beneficiarioId: '22',
    },
    actor(),
    '1',
  );
  assert.equal(guardado.unidadNegocioId, 2n);
  assert.equal(guardado.beneficiarioId, 22n);
});

test('las referencias de cliente, almacén, venta y cuenta ajenos se rechazan antes de escribir', async () => {
  const db = datosPrueba();
  db.almacen = { findFirst: async () => ({ unidadNegocioId: 1n }) };
  for (const [referencia, codigo] of [
    [{ clienteId: 1n }, 400],
    [{ almacenId: 1n }, 400],
    [{ ventaId: 1n }, 404],
    [{ cuentaCobrarId: 1n }, 404],
  ]) {
    await assert.rejects(exigirMismaUnidad(db, 2n, referencia), status(codigo));
  }
});

test('el administrador principal ve las ventas y los gastos de ambas unidades aunque pertenezca a una independiente', async () => {
  const db = datosPrueba();
  const principal = actor(false, true);
  const unidades = new UnidadesService(db);
  assert.deepEqual(
    (await unidades.propias(principal)).map((u) => u.id),
    ['1', '2'],
  );
  assert.deepEqual(
    (
      await new ExpensesService(db).list(
        principal,
        undefined,
        undefined,
        undefined,
        undefined,
        'todas',
      )
    ).map((g) => g.monto),
    [5000, 30],
  );
  assert.deepEqual(
    (
      await new OperationsService(db, {}).sales(principal, undefined, undefined, undefined, 'todas')
    ).map((v) => v.total),
    [9000, 100],
  );
  const rolVendedor = { accesoTotal: false, permisos: [{ clave: 'ventas.ver' }] };
  assert.equal(permisosEnUnidad(rolVendedor, false, true).accesoTotal, true);
  assert.ok(
    permisosEnUnidad(rolVendedor, false, true).permisos.includes('trabajadores.administrar'),
  );
});

function cuentasPrueba(principalActual = false, otrosPrincipales = 1) {
  const actual = {
    id: 'cuenta-editada',
    name: 'Operador',
    email: 'operador@example.test',
    username: 'operador',
    active: true,
    administradorPrincipal: principalActual,
    role: rolTotal,
    trabajador: null,
  };
  const cambios = [];
  let preferenciasBorradas = 0;
  let bloqueos = 0;
  const tx = {
    $executeRaw: async () => {
      bloqueos++;
      return 1;
    },
    role: { findUnique: async () => ({ id: 'rol-vendedor', estado: true, nombre: 'Vendedor' }) },
    user: {
      findUnique: async () => actual,
      count: async () => otrosPrincipales,
      create: async ({ data }) => {
        cambios.push(data);
        return { ...actual, ...data };
      },
      update: async ({ data }) => {
        cambios.push(data);
        return { ...actual, ...data };
      },
    },
    usuarioUnidadVisible: {
      deleteMany: async () => {
        preferenciasBorradas++;
        return { count: 1 };
      },
    },
  };
  const db = { ...tx, $transaction: async (fn) => fn(tx) };
  return {
    db,
    tx,
    cambios,
    get borradas() {
      return preferenciasBorradas;
    },
    get bloqueos() {
      return bloqueos;
    },
  };
}

test('crear una cuenta la limita por defecto y solo un principal puede otorgar acceso global', async () => {
  const prueba = cuentasPrueba();
  const users = new UsersService(prueba.db);
  const dto = {
    name: 'Nuevo Operador',
    email: 'nuevo@example.test',
    username: 'nuevo',
    password: 'clave-prueba',
    role: 'SELLER',
  };
  const limitada = await users.create(dto);
  assert.equal(limitada.administradorPrincipal, false);
  await assert.rejects(
    users.create({ ...dto, administradorPrincipal: true }, undefined, actor(true)),
    status(403),
  );
  await assert.rejects(
    users.update('cuenta-editada', { administradorPrincipal: true }, undefined, actor()),
    status(403),
  );
  const global = await users.create(
    { ...dto, administradorPrincipal: true },
    undefined,
    actor(false, true),
  );
  assert.equal(global.administradorPrincipal, true);
  assert.equal(prueba.cambios.length, 2);
});

test('promover una cuenta borra su selección anterior para entrar viendo todas las unidades', async () => {
  const prueba = cuentasPrueba();
  const resultado = await new UsersService(prueba.db).update(
    'cuenta-editada',
    { administradorPrincipal: true },
    undefined,
    actor(true, true),
  );
  assert.equal(resultado.administradorPrincipal, true);
  assert.equal(prueba.borradas, 1);
});

test('no se puede quitar ni desactivar el último administrador principal', async () => {
  const prueba = cuentasPrueba(true, 0);
  const users = new UsersService(prueba.db);
  for (const dto of [{ administradorPrincipal: false }, { active: false }]) {
    await assert.rejects(
      users.update('cuenta-editada', dto, undefined, actor(true, true)),
      status(400),
    );
  }
  assert.equal(prueba.cambios.length, 0);
  assert.equal(prueba.bloqueos, 2);
  const conOtro = cuentasPrueba(true, 1);
  const limitada = await new UsersService(conOtro.db).update(
    'cuenta-editada',
    { administradorPrincipal: false },
    undefined,
    actor(true, true),
  );
  assert.equal(limitada.administradorPrincipal, false);
  assert.equal(conOtro.borradas, 1);
});

test('el formulario del trabajador guarda el indicador de principal junto con la cuenta y la unidad', async () => {
  const db = datosPrueba();
  const principal = actor(true, true);
  const llamadas = [];
  const users = {
    create: async (dto, tx, solicitante) => {
      llamadas.push({ dto, tx, solicitante });
      return { id: 'nueva-cuenta' };
    },
    update: async (id, dto, tx, solicitante) => llamadas.push({ id, dto, tx, solicitante }),
  };
  const cuenta = {
    id: 'nueva-cuenta',
    name: 'Nuevo Operador',
    username: 'nuevo',
    email: 'nuevo@example.test',
    role: rolTotal,
    active: true,
    administradorPrincipal: true,
  };
  const tx = {
    trabajador: {
      create: async ({ data }) => ({
        id: 33n,
        estado: true,
        ...data,
        user: cuenta,
        unidadNegocio: { nombre: 'Independiente' },
      }),
    },
  };
  db.$transaction = async (fn) => fn(tx);
  const servicio = new TrabajadoresService(db, users);
  const dto = {
    tipoDocumento: 'DNI',
    numeroDocumento: '12345678',
    nombres: 'Nuevo',
    apellidos: 'Operador',
    correo: 'nuevo@example.test',
    cargo: 'Administrador',
    unidadNegocioId: '2',
    cuenta: {
      username: 'nuevo',
      password: 'clave-prueba',
      role: 'ADMIN',
      administradorPrincipal: true,
    },
  };
  const trabajador = await servicio.create(dto, principal);
  assert.equal(trabajador.unidadNegocioId, '2');
  assert.equal(trabajador.usuario.administradorPrincipal, true);
  await servicio.aplicarCuenta(
    tx,
    { cuenta: { ...dto.cuenta, administradorPrincipal: false } },
    { nombres: 'Nuevo', apellidos: 'Operador', correo: dto.correo, estado: true },
    cuenta.id,
    principal,
  );
  assert.equal(llamadas[0].dto.administradorPrincipal, true);
  assert.equal(llamadas[1].dto.administradorPrincipal, false);
  for (const llamada of llamadas) {
    assert.equal(llamada.solicitante, principal);
    assert.equal(llamada.tx, tx);
  }
});

test('un administrador principal conserva sus permisos aunque cambie los permisos de su rol', async () => {
  const db = {
    role: {
      findUnique: async () => ({
        id: 'rol',
        clave: 'ADMIN',
        accesoTotal: false,
        permisos: [],
        _count: { users: 1 },
      }),
    },
    $transaction: async (fn) =>
      fn({
        role: { update: async () => {} },
        rolPermiso: { deleteMany: async () => {}, createMany: async () => {} },
      }),
  };
  const roles = new RolesService(db);
  roles.get = async () => ({ id: 'rol' });
  assert.deepEqual(await roles.update('rol', { permisos: ['ventas.ver'] }, actor(false, true)), {
    id: 'rol',
  });
});
