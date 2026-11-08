import assert from 'node:assert/strict';
import test from 'node:test';
import { checkDmy, formatDmy, isoDaysBefore, longDateLabel, parseDmy } from '../src/lib/dmyDate.js';
import { fillOutstanding } from '../src/components/admin/PaymentForm.js';

test('reads dates day-first: 01/11/2026 is 1 November, not 11 January (accountant report)', () => {
  assert.equal(parseDmy('01/11/2026'), '2026-11-01');
  assert.equal(parseDmy('1/11/2026'), '2026-11-01');
  assert.equal(parseDmy('01-11-26'), '2026-11-01');
  assert.equal(parseDmy('01.11.2026'), '2026-11-01');
  assert.equal(parseDmy(' 01112026 '), '2026-11-01');
  assert.equal(parseDmy('29/02/2028'), '2028-02-29');
});

test('rejects impossible or unclear dates', () => {
  for (const bad of ['31/02/2026', '13/13/2026', '00/11/2026', '29/02/2027', '2026-11-01', '1/11', 'abc', '']) assert.equal(parseDmy(bad), null, bad);
});

test('formats and labels dates', () => {
  assert.equal(formatDmy('2026-11-01'), '01/11/2026');
  assert.equal(formatDmy(''), '');
  assert.equal(longDateLabel('2026-11-01'), 'Sun 1 Nov 2026');
  assert.equal(isoDaysBefore('2026-11-01', 1), '2026-10-31');
});

test('checkDmy blocks dates after max and explains problems', () => {
  assert.deepEqual(checkDmy('09/11/2026', '2026-11-09'), { iso: '2026-11-09' });
  assert.match(checkDmy('10/11/2026', '2026-11-09').error!, /can't be after/);
  assert.match(checkDmy('31/02/2026').error!, /Not a real date/);
  assert.match(checkDmy('').error!, /dd\/mm\/yyyy/);
});

test('fill outstanding spreads oldest-first and puts the rest in the current month', () => {
  const months = [{ month: '2026-11', outstanding_cents: 24000 }, { month: '2026-12', outstanding_cents: 24000 }];
  assert.deepEqual(fillOutstanding(30000, months, '2026-12'), [{ month: '2026-11', amount: '240.00' }, { month: '2026-12', amount: '60.00' }]);
  assert.deepEqual(fillOutstanding(60000, months, '2026-12'), [{ month: '2026-11', amount: '240.00' }, { month: '2026-12', amount: '360.00' }]);
  assert.deepEqual(fillOutstanding(10000, [], '2026-11'), [{ month: '2026-11', amount: '100.00' }]);
});
