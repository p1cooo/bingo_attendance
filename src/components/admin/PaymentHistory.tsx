import React from 'react';
import { CreditCard } from 'lucide-react';
import { longDateLabel } from '../../lib/dmyDate.js';
import { money, shortMonthLabel } from '../../lib/financeFormat.js';
import type { PaymentEditableFields, PaymentHistoryEntry, StudentPayment } from '../../types.js';

const empty = 'flex items-start gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-4 text-slate-500 dark:border-neutral-700 dark:bg-neutral-800/40 dark:text-slate-400';
const small = 'rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-neutral-700 dark:text-slate-200 dark:hover:bg-neutral-800';

const allocationText = (p: Pick<PaymentEditableFields, 'allocations'>) => p.allocations.map(a => `${shortMonthLabel(a.month)} ${money(a.amount_cents)}`).join(', ');
const when = (iso: string) => longDateLabel(iso.slice(0, 10));

/** Plain list of what an edit changed, e.g. "date 11 Jan 2026 → 1 Nov 2026". */
export function describeChanges(before: PaymentEditableFields, after: PaymentEditableFields): string {
  const changes: string[] = [];
  if (before.payment_date !== after.payment_date) changes.push(`date ${longDateLabel(before.payment_date)} → ${longDateLabel(after.payment_date)}`);
  if (before.amount_cents !== after.amount_cents) changes.push(`amount ${money(before.amount_cents)} → ${money(after.amount_cents)}`);
  if (before.method !== after.method) changes.push(`method ${before.method} → ${after.method}`);
  if (allocationText(before) !== allocationText(after)) changes.push(`months ${allocationText(before)} → ${allocationText(after)}`);
  if ((before.reference || '') !== (after.reference || '')) changes.push(`reference "${before.reference || '—'}" → "${after.reference || '—'}"`);
  if ((before.notes || '') !== (after.notes || '')) changes.push('notes');
  return changes.join('; ') || 'no visible change';
}

/** Each edit compared with the version that came after it. */
function editLines(p: StudentPayment): { entry: PaymentHistoryEntry; text: string }[] {
  const history = p.history || [];
  return history.map((entry, i) => {
    const after = history[i + 1]?.before ?? p;
    return { entry, text: entry.action === 'EDIT' ? describeChanges(entry.before, after) : 'deleted' };
  });
}

interface PaymentHistoryProps {
  payments: StudentPayment[];
  deletedPayments: StudentPayment[];
  onEdit: (p: StudentPayment) => void;
  onDelete: (p: StudentPayment) => void;
}

export const PaymentHistory: React.FC<PaymentHistoryProps> = ({ payments, deletedPayments, onEdit, onDelete }) => {
  return <div className="mt-3 space-y-3">
    {payments.map(p => <div key={p.id} className="border-b border-slate-200 pb-3 text-sm dark:border-neutral-700">
      <div className="flex justify-between gap-2"><b>{money(p.amount_cents)}</b><span>{longDateLabel(p.payment_date)}</span></div>
      <p className="text-slate-500">{p.method} · {p.source === 'MANUAL' ? 'Manual' : p.source} · {allocationText(p)}</p>
      <p className="text-xs text-slate-500">Recorded by {p.recorded_by_name || p.recorded_by_user_id}{p.reference ? ` · Ref ${p.reference}` : ''}{p.notes ? ` · ${p.notes}` : ''}</p>
      {Boolean(p.history?.length) && <details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer font-bold text-amber-700">Edited {p.history!.length}×</summary>
        <ul className="mt-1 space-y-1">{editLines(p).map(({ entry, text }) => <li key={entry.at}>{when(entry.at)} by {entry.by_name || entry.by_user_id}: {text} — “{entry.reason}”</li>)}</ul>
      </details>}
      {p.source === 'MANUAL' && <div className="mt-2 flex gap-2"><button type="button" className={small} onClick={() => onEdit(p)}>Edit</button><button type="button" className={small + ' text-rose-700 dark:text-rose-300'} onClick={() => onDelete(p)}>Delete</button></div>}
    </div>)}
    {!payments.length && <div className={empty}><CreditCard className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No payments yet</p><p className="mt-0.5 text-xs">Recorded payments and their covered months will appear here.</p></div></div>}
    {deletedPayments.length > 0 && <details className="text-xs text-slate-500"><summary className="cursor-pointer font-bold">Deleted payments ({deletedPayments.length})</summary>
      <ul className="mt-2 space-y-2">{deletedPayments.map(p => <li key={p.id}><span className="line-through">{money(p.amount_cents)} paid {longDateLabel(p.payment_date)} · {allocationText(p)}</span><br />Deleted by {p.deleted_by_name || 'admin'} on {when(p.deleted_at!)} — “{p.delete_reason}”</li>)}</ul>
    </details>}
  </div>;
};
