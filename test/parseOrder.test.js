const assert = require('assert');
const { parseOrder } = require('../lib/parseOrder');

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

run('Thai "x N" multiplier — ลาเกอร์ x 2', () => {
  const order = parseOrder('ลาเกอร์ x 2');
  assert.ok(order);
  assert.strictEqual(order.productId, 'keg_lager');
  assert.strictEqual(order.quantity, 2);
});

run('capacity mention ignored, "N ถัง" used — โรเซ่ 20L 4 ถัง', () => {
  const order = parseOrder('โรเซ่ 20L 4 ถัง');
  assert.ok(order);
  assert.strictEqual(order.productId, 'keg_rose');
  assert.strictEqual(order.quantity, 4);
});

run('bare trailing number — Dunkel 1', () => {
  const order = parseOrder('Dunkel 1');
  assert.ok(order);
  assert.strictEqual(order.productId, 'keg_dunkel');
  assert.strictEqual(order.quantity, 1);
});

run('defaults quantity to 1 when no number is present', () => {
  const order = parseOrder('can we get some lager please');
  assert.ok(order);
  assert.strictEqual(order.productId, 'keg_lager');
  assert.strictEqual(order.quantity, 1);
});

run('is case-insensitive for English keywords', () => {
  const order = parseOrder('ROSE x3');
  assert.ok(order);
  assert.strictEqual(order.productId, 'keg_rose');
  assert.strictEqual(order.quantity, 3);
});

run('returns null for ordinary chat with no keyword', () => {
  const order = parseOrder('good morning everyone, meeting at 10');
  assert.strictEqual(order, null);
});

run('does not mistake a keg\'s 20L size for the quantity when no count given', () => {
  const order = parseOrder('lager 20L');
  assert.ok(order);
  assert.strictEqual(order.quantity, 1);
});

console.log('All parseOrder tests completed.');
