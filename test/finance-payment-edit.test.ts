import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../server/db.js';
import { financeDetail } from '../server/finance.js';
import { applyPaymentDelete, applyPaymentEdit, paymentVersion } from '../server/paymentCorrections.js';
import { describeChanges } from '../src/components/admin/PaymentHistory.js';
import type { Student, StudentPayment } from '../src/types.js';

const admin = { id: 'admin-1', name: 'Accountant' };
const NOW = '2026-11-09T03:00:00.000Z';
const wrongDate: StudentPayment = {
  id: 'pay-1', student_id: 's1', amount_cents: 24000, payment_date: '2026-01-11', method: 'Bank transfer', source: 'MANUAL',
  reference: 'R1', notes: '', allocations: [{ month: '2026-11', amount_cents: 24000 }], recorded_by_user_id: 'admin-1', recorded_by_name: 'Accountant',
  created_at: '2026-11-08T10:00:00.000Z',
};
const editBody = (patch: Record<string, unknown> = {}) => ({ amount_cents: 24000, payment_date: '2026-11-01', method: 'Bank transfer', reference: 'R1', notes: '',
  allocations: [{ month: '2026-11', amount_cents: 24000 }], reason: 'wrong date typed', ...patch });

test('editing fixes the date and keeps the old version in history', () => {
  const result = applyPaymentEdit(wrongDate, editBody(), admin, NOW);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payment.payment_date, '2026-11-01');
  assert.equal(result.payment.updated_at, NOW);
  assert.equal(result.payment.history!.length, 1);
  assert.equal(result.payment.history![0].before.payment_date, '2026-01-11');
  assert.equal(result.payment.history![0].reason, 'wrong date typed');
  assert.equal(wrongDate.payment_date, '2026-01-11', 'original object is not mutated');
  assert.equal(paymentVersion(wrongDate), wrongDate.created_at);
  assert.equal(paymentVersion(result.payment), NOW);
  assert.match(describeChanges(result.payment.history![0].before, result.payment), /date Sun 11 Jan 2026 → Sun 1 Nov 2026/);
});

test('edit is rejected without a reason, with bad amounts, or when nothing changed', () => {
  const noReason = applyPaymentEdit(wrongDate, editBody({ reason: ' ' }), admin, NOW);
  assert.equal(noReason.ok, false);
  const badSplit = applyPaymentEdit(wrongDate, editBody({ amount_cents: 30000 }), admin, NOW);
  assert.equal(badSplit.ok, false);
  const badDate = applyPaymentEdit(wrongDate, editBody({ payment_date: '2026-02-31' }), admin, NOW);
  assert.equal(badDate.ok, false);
  const same = applyPaymentEdit(wrongDate, editBody({ payment_date: '2026-01-11' }), admin, NOW);
  assert.deepEqual(same, { ok: false, status: 400, error: 'Nothing changed.' });
});

test('delete needs a reason, is soft, and repeating it changes nothing', () => {
  assert.equal(applyPaymentDelete(wrongDate, { reason: '' }, admin, NOW).ok, false);
  const result = applyPaymentDelete(wrongDate, { reason: 'recorded twice' }, admin, NOW);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payment.deleted_at, NOW);
  assert.equal(result.payment.delete_reason, 'recorded twice');
  assert.equal(result.payment.history![0].action, 'DELETE');
  const again = applyPaymentDelete(result.payment, { reason: 'again' }, admin, '2026-11-10T00:00:00.000Z');
  assert.equal(again.ok && again.payment, result.payment);
  assert.equal(applyPaymentEdit(result.payment, editBody(), admin, NOW).ok, false, 'deleted payments cannot be edited');
});

test('deleted payments stop counting toward the balance but stay listed', () => {
  const maps = [db.students, db.memberships, db.studentPayments, db.studentFees, db.studentAdjustments, db.membershipBillingReviews] as const;
  const saved = maps.map(m => new Map(m as Map<string, any>));
  try {
    maps.forEach(m => m.clear());
    db.students.set('s1', { id: 's1', student_id: 'STU-0001', full_name: 'Alex', status: 'ACTIVE', created_at: '2026-11-01T00:00:00Z' } as Student);
    db.studentPayments.set('pay-1', wrongDate);
    const before = financeDetail('s1', '2026-11')!;
    assert.equal(before.payments.length, 1);
    assert.equal(before.last_payment, '2026-01-11');
    const deleted = applyPaymentDelete(wrongDate, { reason: 'recorded twice' }, admin, NOW);
    assert.ok(deleted.ok);
    if (!deleted.ok) return;
    db.studentPayments.set('pay-1', deleted.payment);
    const after = financeDetail('s1', '2026-11')!;
    assert.equal(after.payments.length, 0);
    assert.equal(after.deleted_payments.length, 1);
    assert.equal(after.last_payment, null);
    assert.equal(after.outstanding_cents, before.outstanding_cents + 24000);
  } finally {
    maps.forEach((m, i) => { m.clear(); for (const [k, v] of saved[i]) (m as Map<string, any>).set(k, v); });
  }
});
