const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { CajaController } = require('../dist/caja/caja.controller');
const { PermisosGuard } = require('../dist/auth/permisos.guard');
const { permisosEnUnidad } = require('../dist/auth/permisos-unidad');
const guard = new PermisosGuard(new Reflector());
const context = (action, permisos) => ({
  getClass: () => CajaController,
  getHandler: () => CajaController.prototype[action],
  switchToHttp: () => ({
    getRequest: () => ({ user: { permisos, accesoTotal: false, rolNombre: 'Operador' } }),
  }),
});
test('Caja separa consulta, movimientos y ajustes en los endpoints', () => {
  for (const action of ['cuentas', 'movimientos']) {
    assert.equal(guard.canActivate(context(action, ['caja.ver'])), true);
    assert.throws(
      () => guard.canActivate(context(action, [])),
      (e) => e.getStatus() === 403,
    );
  }
  for (const action of ['manual', 'transferir']) {
    assert.throws(
      () => guard.canActivate(context(action, ['caja.ver', 'caja.ajustar'])),
      (e) => e.getStatus() === 403,
    );
    assert.equal(guard.canActivate(context(action, ['caja.movimientos'])), true);
  }
  for (const action of ['apertura', 'ajustar']) {
    assert.throws(
      () => guard.canActivate(context(action, ['caja.ver', 'caja.movimientos'])),
      (e) => e.getStatus() === 403,
    );
    assert.equal(guard.canActivate(context(action, ['caja.ajustar'])), true);
  }
});
test('Caja respeta los permisos asignados en unidades sin inventario', () => {
  const assigned = ['caja.ver', 'caja.movimientos', 'caja.ajustar'];
  assert.deepEqual(
    permisosEnUnidad({ accesoTotal: false, permisos: assigned.map((clave) => ({ clave })) }, false)
      .permisos,
    assigned,
  );
  assert.deepEqual(permisosEnUnidad({ accesoTotal: false, permisos: [] }, false).permisos, []);
});
