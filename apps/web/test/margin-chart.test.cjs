const assert = require('node:assert/strict');
const test = require('node:test');
require('tsx/cjs');
const { marginScale } = require('../lib/margin-chart.ts');

test('sin movimiento mantiene una escala finita desde cero', () => {
  for (const values of [[], [0], [0, 0, 0]]) {
    const scale = marginScale(values);
    assert.equal(scale.min, 0);
    assert.equal(scale.max, 1);
    assert.deepEqual(scale.ticks, [1, 0.75, 0.5, 0.25, 0]);
  }
});

test('ganancias y pérdidas quedan a su lado de la línea de cero', () => {
  assert.deepEqual(marginScale([60, 240]), {
    min: 0,
    max: 300,
    ticks: [300, 200, 100, 0],
  });
  assert.deepEqual(marginScale([-180, 0]), {
    min: -200,
    max: 0,
    ticks: [0, -50, -100, -150, -200],
  });
});

test('una serie que cruza cero conserva todos los importes y la referencia de cero', () => {
  const values = [-190, 10, 40, 200];
  const scale = marginScale(values);
  assert.ok(scale.min <= Math.min(...values));
  assert.ok(scale.max >= Math.max(...values));
  assert.ok(scale.ticks.includes(0));
  assert.ok(scale.ticks.length <= 7);
  assert.equal(new Set(scale.ticks).size, scale.ticks.length);
});

test('los céntimos no desaparecen en una escala de soles enteros', () => {
  const scale = marginScale([-0.01, 0.01]);
  assert.equal(scale.min, -0.01);
  assert.equal(scale.max, 0.01);
  assert.deepEqual(scale.ticks, [0.01, 0, -0.01]);
});
