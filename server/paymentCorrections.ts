import { cents, validAllocations, validDate } from './finance.js';
import type { PaymentEditableFields, StudentPayment } from '../src/types.js';

const MIN_REASON_LENGTH = 3;
const MAX_REASON_LENGTH = 300;
const MAX_METHOD_LENGTH = 60;
const MAX_REFERENCE_LENGTH = 100;
const MAX_NOTES_LENGTH = 500;

export interface PaymentActor { id: string; name?: string }
export type CorrectionResult = { ok: true; payment: StudentPayment } | { ok: false; status: number; error: string };

const editable = (p: StudentPayment): PaymentEditableFields => ({
  amount_cents: p.amount_cents, payment_date: p.payment_date, method: p.method,
  reference: p.reference || '', notes: p.notes || '', allocations: p.allocations,
});

export function cleanReason(value: unknown): string | null {
  const reason = String(value ?? '').trim().slice(0, MAX_REASON_LENGTH);
  return reason.length >= MIN_REASON_LENGTH ? reason : null;
}

/** Validates an edit request and returns the new payment version (old values kept in history). */
export function applyPaymentEdit(current: StudentPayment, body: Record<string, unknown>, actor: PaymentActor, now: string): CorrectionResult {
  if (current.deleted_at) return { ok: false, status: 409, error: 'This payment was deleted and can no longer be edited.' };
  const reason = cleanReason(body.reason);
  if (!reason) return { ok: false, status: 400, error: 'Give a reason for the change (at least 3 characters).' };
  const amount = cents(body.amount_cents);
  if (!amount || !validDate(body.payment_date) || !validAllocations(body.allocations, amount)) return { ok: false, status: 400, error: 'Enter a valid payment and allocate its full amount to distinct months.' };
  const method = String(body.method ?? '').trim();
  if (!method || method.length > MAX_METHOD_LENGTH) return { ok: false, status: 400, error: 'Payment method is required.' };
  const next: PaymentEditableFields = {
    amount_cents: amount, payment_date: body.payment_date, method,
    reference: String(body.reference ?? '').slice(0, MAX_REFERENCE_LENGTH), notes: String(body.notes ?? '').slice(0, MAX_NOTES_LENGTH),
    allocations: (body.allocations as { month: string; amount_cents: number }[]).map(a => ({ month: a.month, amount_cents: a.amount_cents })),
  };
  const before = editable(current);
  if (JSON.stringify(before) === JSON.stringify(next)) return { ok: false, status: 400, error: 'Nothing changed.' };
  return { ok: true, payment: { ...current, ...next, updated_at: now,
    history: [...(current.history || []), { action: 'EDIT', at: now, by_user_id: actor.id, by_name: actor.name, reason, before }] } };
}

/** Soft-deletes a payment. Deleting an already deleted payment returns it unchanged. */
export function applyPaymentDelete(current: StudentPayment, body: Record<string, unknown>, actor: PaymentActor, now: string): CorrectionResult {
  if (current.deleted_at) return { ok: true, payment: current };
  const reason = cleanReason(body.reason);
  if (!reason) return { ok: false, status: 400, error: 'Give a reason for deleting (at least 3 characters).' };
  return { ok: true, payment: { ...current, updated_at: now, deleted_at: now, deleted_by_name: actor.name, delete_reason: reason,
    history: [...(current.history || []), { action: 'DELETE', at: now, by_user_id: actor.id, by_name: actor.name, reason, before: editable(current) }] } };
}

/** The version stamp a client must send back so two admins can't overwrite each other. */
export const paymentVersion = (p: StudentPayment): string => p.updated_at || p.created_at;
