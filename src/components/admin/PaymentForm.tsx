import React, { useState } from 'react';
import { DmyDateInput } from '../common/DmyDateInput.js';
import { longDateLabel } from '../../lib/dmyDate.js';
import { amountToCents, centsToAmount, money, shortMonthLabel } from '../../lib/financeFormat.js';
import type { PaymentEditableFields } from '../../types.js';

const field = 'w-full rounded-xl border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white';
const button = 'rounded-xl bg-slate-900 hover:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs dark:bg-white dark:text-slate-900 disabled:opacity-50';
const minor = 'rounded-xl border border-slate-200 dark:border-neutral-700 bg-white hover:bg-slate-50 dark:bg-neutral-800 dark:hover:bg-neutral-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs';
const METHODS = ['Bank transfer', 'Cash', 'Card', 'Other'];
const MIN_REASON_LENGTH = 3;

type AllocationDraft = { month: string; amount: string };
export interface OutstandingMonth { month: string; outstanding_cents: number }

/** Spread a payment over the oldest owing months; anything left over goes to the current month. */
export function fillOutstanding(totalCents: number, months: OutstandingMonth[], currentMonth: string): AllocationDraft[] {
  let left = totalCents;
  const filled: { month: string; cents: number }[] = [];
  for (const m of months.filter(x => x.outstanding_cents > 0)) {
    if (left <= 0) break;
    const take = Math.min(left, m.outstanding_cents);
    filled.push({ month: m.month, cents: take });
    left -= take;
  }
  const withRest = left <= 0 ? filled
    : filled.some(f => f.month === currentMonth) ? filled.map(f => f.month === currentMonth ? { ...f, cents: f.cents + left } : f)
      : [...filled, { month: currentMonth, cents: left }];
  return withRest.map(f => ({ month: f.month, amount: centsToAmount(f.cents) }));
}

interface PaymentFormProps {
  /** Present when editing an existing payment. */
  initial?: PaymentEditableFields;
  defaultDate: string;
  /** Shown under the date when it was carried over from the last payment. */
  defaultDateHint?: string;
  currentMonth: string;
  /** Month pre-filled in the first "Months covered" row of a new payment. */
  startMonth?: string;
  today: string;
  outstandingMonths: OutstandingMonth[];
  busy: boolean;
  submitLabel: string;
  onSubmit: (values: PaymentEditableFields, reason: string) => void;
}

/** Record / edit payment form with a "check before saving" step. */
export const PaymentForm: React.FC<PaymentFormProps> = ({ initial, defaultDate, defaultDateHint, currentMonth, startMonth = currentMonth, today, outstandingMonths, busy, submitLabel, onSubmit }) => {
  const editing = Boolean(initial);
  const [amount, setAmount] = useState(initial ? centsToAmount(initial.amount_cents) : '');
  const [date, setDate] = useState(initial?.payment_date || defaultDate);
  const [method, setMethod] = useState(initial?.method || METHODS[0]);
  const [reference, setReference] = useState(initial?.reference || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [allocations, setAllocations] = useState<AllocationDraft[]>(initial
    ? initial.allocations.map(a => ({ month: a.month, amount: centsToAmount(a.amount_cents) }))
    : [{ month: startMonth, amount: '' }]);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const values = (): PaymentEditableFields => ({ amount_cents: amountToCents(amount), payment_date: date, method, reference: reference.trim(), notes: notes.trim(),
    allocations: allocations.map(a => ({ month: a.month, amount_cents: amountToCents(a.amount) })) });
  const problem = (v: PaymentEditableFields): string => {
    if (!(v.amount_cents > 0)) return 'Enter the amount paid, e.g. 240 or 240.50.';
    if (!date) return 'Enter a valid payment date (dd/mm/yyyy).';
    if (v.allocations.some(a => !a.month || !(a.amount_cents > 0))) return 'Each covered month needs a month and an amount.';
    if (new Set(v.allocations.map(a => a.month)).size !== v.allocations.length) return 'Each month can only be listed once.';
    const allocated = v.allocations.reduce((n, a) => n + a.amount_cents, 0);
    if (allocated !== v.amount_cents) return `Months covered add up to ${money(allocated)} but the amount is ${money(v.amount_cents)}.`;
    if (editing && reason.trim().length < MIN_REASON_LENGTH) return 'Give a reason for the change.';
    return '';
  };
  const review = (e: React.FormEvent) => { e.preventDefault(); const p = problem(values()); setError(p); if (!p) setConfirming(true); };
  const setAllocation = (i: number, patch: Partial<AllocationDraft>) => setAllocations(allocations.map((x, j) => j === i ? { ...x, ...patch } : x));

  if (confirming) {
    const v = values();
    return <div className="space-y-3 pt-4">
      <p className="text-sm font-bold">Please check before saving</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-800">
        <dt className="text-slate-500">Amount</dt><dd className="font-bold">{money(v.amount_cents)}</dd>
        <dt className="text-slate-500">Paid on</dt><dd className="font-bold">{longDateLabel(v.payment_date)}</dd>
        <dt className="text-slate-500">Method</dt><dd className="font-bold">{v.method}</dd>
        <dt className="text-slate-500">For</dt><dd className="font-bold">{v.allocations.map(a => `${shortMonthLabel(a.month)} ${money(a.amount_cents)}`).join(', ')}</dd>
        {v.reference && <><dt className="text-slate-500">Reference</dt><dd className="font-bold">{v.reference}</dd></>}
        {v.notes && <><dt className="text-slate-500">Notes</dt><dd>{v.notes}</dd></>}
        {editing && <><dt className="text-slate-500">Reason</dt><dd>{reason.trim()}</dd></>}
      </dl>
      <div className="flex gap-2"><button type="button" className={button} disabled={busy} onClick={() => onSubmit(v, reason.trim())}>{busy ? 'Saving…' : 'Confirm'}</button><button type="button" className={minor} disabled={busy} onClick={() => setConfirming(false)}>Go back</button></div>
    </div>;
  }

  return <form className="space-y-3 overflow-y-auto pt-4" onSubmit={review} noValidate>
    <label className="block text-sm font-bold">Amount (RM)<input className={field} required inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); if (allocations.length === 1) setAllocation(0, { amount: e.target.value }); }} /></label>
    <DmyDateInput label="Payment date" className={field} value={date} onChange={setDate} today={today} max={today} hint={date === defaultDate && !editing ? defaultDateHint : undefined} />
    <label className="block text-sm font-bold">Method<select className={field} value={method} onChange={e => setMethod(e.target.value)}>{[...new Set([...METHODS, method])].map(m => <option key={m}>{m}</option>)}</select></label>
    <div><p className="text-sm font-bold">Months covered</p>
      {allocations.map((a, i) => <div key={i} className="mt-2 flex gap-2">
        <input aria-label={`Month ${i + 1}`} className={field} type="month" value={a.month} onChange={e => setAllocation(i, { month: e.target.value })} />
        <input aria-label={`Amount for month ${i + 1}`} className={field} placeholder="RM" inputMode="decimal" value={a.amount} onChange={e => setAllocation(i, { amount: e.target.value })} />
        {allocations.length > 1 && <button type="button" aria-label={`Remove month ${i + 1}`} onClick={() => setAllocations(allocations.filter((_, j) => j !== i))}>×</button>}
      </div>)}
      <div className="mt-2 flex gap-3">
        <button type="button" className="text-sm font-bold text-amber-700" onClick={() => setAllocations([...allocations, { month: currentMonth, amount: '' }])}>+ Add month</button>
        <button type="button" className="text-sm font-bold text-amber-700" onClick={() => { const total = amountToCents(amount); if (!(total > 0)) return; const next = fillOutstanding(total, outstandingMonths, currentMonth); setAllocations(next.length ? next : [{ month: currentMonth, amount }]); }}>Fill outstanding months</button>
      </div>
    </div>
    <label className="block text-sm font-bold">Reference / receipt<input className={field} value={reference} onChange={e => setReference(e.target.value)} /></label>
    <label className="block text-sm font-bold">Notes<input className={field} value={notes} onChange={e => setNotes(e.target.value)} /></label>
    {editing && <label className="block text-sm font-bold">Reason for change<input className={field} required minLength={MIN_REASON_LENGTH} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. wrong date typed" /></label>}
    {error && <p role="alert" className="text-xs font-bold text-rose-600">{error}</p>}
    <button className={button} disabled={busy}>{submitLabel}</button>
  </form>;
};
