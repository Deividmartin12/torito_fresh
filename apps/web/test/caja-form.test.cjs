const assert = require('node:assert/strict');
const test = require('node:test');
require('tsx/cjs');
const {
  parseCajaAmount,
  sumarCaja,
  fechaLimaInput,
  fechaCajaManual,
  identidadCaja,
} = require('../lib/caja-form.ts');

test('los importes admiten coma, punto, céntimos y saldos negativos sin separadores de miles', () => {
  for (const [text, value] of [
    ['3,50', 3.5],
    [' 3.50 ', 3.5],
    ['.05', 0.05],
    [',50', 0.5],
    ['-0,01', -0.01],
    ['10.', 10],
    ['0007,10', 7.1],
    ['-0.00', 0],
    ['9999999999,99', 9999999999.99],
  ]) {
    assert.equal(parseCajaAmount(text), value, text);
  }
});
test('no convierte vacío en cero ni redondea decimales extra o acepta importes fuera del límite', () => {
  for (const text of [
    '',
    ' ',
    'abc',
    '-',
    '.',
    '1,000',
    '1.001',
    '1,234.56',
    '1 000',
    '1e3',
    'NaN',
    'Infinity',
    '10000000000.00',
    '-10000000000.00',
  ])
    assert.equal(parseCajaAmount(text), null, text);
});
test('las estimaciones y las diferencias conservan céntimos y el signo', () => {
  assert.equal(sumarCaja(0.1, 0.2), 0.3);
  assert.equal(sumarCaja(100, -100), 0);
  assert.equal(sumarCaja(-0.01, -0.02), -0.03);
  assert.equal(sumarCaja(150, -200), -50);
});
test('las fechas de Caja usan el día y la hora de Lima incluso alrededor de medianoche UTC', () => {
  assert.equal(fechaLimaInput(new Date('2026-10-04T04:59:59Z')), '2026-10-03');
  assert.equal(fechaLimaInput(new Date('2026-10-04T05:00:00Z'), true), '2026-10-04T00:00');
  assert.equal(fechaCajaManual('2026-10-03T23:59'), '2026-10-04T04:59:00.000Z');
  for (const value of ['', '2026-02-30T12:00', '2026-10-03T25:00', '2026-10-03'])
    assert.equal(fechaCajaManual(value), null);
});
test('el mismo envío conserva identidad; corregir sus datos o revisar otra versión crea una nueva', () => {
  let id = 0;
  const newId = () => `id-${++id}`;
  const body = { motivo: 'Conteo', saldoNuevo: 40, version: 3 };
  const first = identidadCaja(null, 'cuentas/1/ajustes', body, newId);
  const retry = identidadCaja(first, 'cuentas/1/ajustes', { ...body }, newId);
  assert.equal(first.id, retry.id);
  assert.equal(id, 1);
  const corrected = identidadCaja(retry, 'cuentas/1/ajustes', { ...body, saldoNuevo: 41 }, newId);
  assert.notEqual(corrected.id, first.id);
  const reviewed = identidadCaja(
    corrected,
    'cuentas/1/ajustes',
    { ...body, saldoNuevo: 41, version: 4 },
    newId,
  );
  assert.notEqual(reviewed.id, corrected.id);
  assert.notEqual(
    identidadCaja(reviewed, 'cuentas/2/ajustes', { ...body, saldoNuevo: 41, version: 4 }, newId).id,
    reviewed.id,
  );
});
