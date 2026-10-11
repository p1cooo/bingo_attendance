import type { ResetDocument } from './attendanceResetPlan.js';
import { validDate, validMonth, validAllocations } from './finance.js';

const paymentFields = new Set(['id', 'student_id', 'amount_cents', 'payment_date', 'method', 'source', 'reference', 'notes', 'allocations', 'recorded_by_user_id', 'recorded_by_name', 'created_at']);
const adjustmentFields = new Set(['id', 'student_id', 'month', 'amount_cents', 'type', 'reason', 'created_by_user_id', 'created_by_name', 'created_at']);

/** Dry-run classification only. Fee versions are configuration, not disposable charges. */
export function planFinanceTestReset(input: { payments: ResetDocument[]; adjustments: ResetDocument[]; fees: ResetDocument[]; billingBaselineDate: string; testTransactionCutoffDate?: string }) {
  if (!validDate(input.billingBaselineDate) || !input.billingBaselineDate.endsWith('-01')) throw new Error('Finance billing baseline must be the first day of a month.');
  if (input.testTransactionCutoffDate && !validDate(input.testTransactionCutoffDate)) throw new Error('Test transaction cutoff must be a valid date.');
  const eligible: Record<'studentPayments' | 'studentAdjustments', string[]> = { studentPayments: [], studentAdjustments: [] };
  const blockers: Array<{ collection: string; id: string; reasons: string[] }> = [];
  const students = new Set<string>();
  let paymentAmountCents = 0;
  let adjustmentAmountCents = 0;
  const seen = new Set<string>();
  for (const [collection, docs, allowed] of [
    ['studentPayments', input.payments, paymentFields], ['studentAdjustments', input.adjustments, adjustmentFields],
  ] as const) {
    for (const row of docs) {
      const reasons: string[] = [];
      const key = `${collection}:${row.id}`;
      if (seen.has(key)) reasons.push('duplicate ID');
      seen.add(key);
      if (Object.keys(row).some(field => !allowed.has(field))) reasons.push('unknown or protected field');
      if (typeof row.student_id !== 'string' || !row.student_id) reasons.push('missing student identity');
      if (!Number.isSafeInteger(row.amount_cents)) reasons.push('invalid amount');
      if (collection === 'studentPayments') {
        if (typeof row.method !== 'string' || !row.method.trim() || !['MANUAL', 'ONLINE_PARENT_PORTAL', 'OTHER'].includes(String(row.source)) ||
          !validAllocations(row.allocations, Number(row.amount_cents))) reasons.push('invalid payment structure');
        if (!input.testTransactionCutoffDate || !validDate(row.payment_date) || String(row.payment_date) >= input.testTransactionCutoffDate) reasons.push('payment has no approved test-data cutoff or is after it');
        if (!Array.isArray(row.allocations) || row.allocations.some((allocation: any) =>
          !validMonth(allocation.month) || input.testTransactionCutoffDate && allocation.month > input.testTransactionCutoffDate.slice(0, 7))) reasons.push('allocation period requires review');
      } else {
        if (!Number.isSafeInteger(row.amount_cents) || row.amount_cents === 0 || !['DISCOUNT', 'CREDIT', 'WAIVER', 'CORRECTION'].includes(String(row.type)) ||
          typeof row.reason !== 'string' || !row.reason.trim()) reasons.push('invalid adjustment structure');
        if (!input.testTransactionCutoffDate || !validDate(String(row.created_at).slice(0, 10)) || String(row.created_at).slice(0, 10) >= input.testTransactionCutoffDate ||
          !validMonth(row.month) || row.month > input.testTransactionCutoffDate.slice(0, 7)) reasons.push('adjustment has no approved test-data cutoff or is after it');
      }
      if (reasons.length) blockers.push({ collection, id: row.id, reasons });
      else {
        eligible[collection].push(row.id);
        students.add(String(row.student_id));
        if (collection === 'studentPayments') paymentAmountCents += Number(row.amount_cents);
        else adjustmentAmountCents += Number(row.amount_cents);
      }
    }
  }
  return { provisional_candidate_ids: eligible, blockers, affected_student_count: students.size,
    payment_amount_cents: paymentAmountCents, adjustment_amount_cents: adjustmentAmountCents,
    fee_versions_preserved: input.fees.length,
    billing_baseline_date: input.billingBaselineDate, test_transaction_cutoff_date: input.testTransactionCutoffDate || null,
    note: 'Candidates are inventory only. A date cannot prove that a transaction was a test. No Finance transaction is approved for deletion without source classification, a signed document manifest, and restore verification.' };
}
