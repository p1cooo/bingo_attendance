import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Modal } from '../common/Modal.js';
import { useToast } from '../common/Toast.js';
import { Search } from 'lucide-react';
import type { ClassFee } from '../../types.js';

type ClassFeeRow = {
  class_id: string; class_name: string; class_type: 'GROUP' | 'INDIVIDUAL'; is_active: boolean; coach_name: string;
  billing_mode: 'MONTHLY' | 'PER_SESSION'; default_cents: number; current_cents: number; source: 'CLASS' | 'DEFAULT';
  upcoming: { amount_cents: number; effective_month: string }[]; history: ClassFee[];
  students: number; own_fee: { student_id: string; full_name: string }[];
};

const FINANCE_START_MONTH = '2026-11';
const money = (cents: number) => `RM${(cents / 100).toFixed(2)}`;
const monthLabel = (month: string) => new Intl.DateTimeFormat('en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
const thisMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const amountToCents = (value: string) => /^\d+(\.\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value) * 100) : NaN;
const unit = (row: Pick<ClassFeeRow, 'billing_mode'>) => row.billing_mode === 'MONTHLY' ? 'month' : 'attended lesson';
const card = 'rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 shadow-2xs';
const field = 'w-full rounded-xl border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white';
const button = 'rounded-xl bg-slate-900 hover:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs dark:bg-white dark:text-slate-900 disabled:opacity-50';
const minor = 'rounded-xl border border-slate-200 dark:border-neutral-700 bg-white hover:bg-slate-50 dark:bg-neutral-800 dark:hover:bg-neutral-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs';

/** Finance → Class fees: one fee for every student in a class. A student's own fee still wins. */
export const ClassFeesPanel: React.FC = () => {
  const { showToast } = useToast();
  const [rows, setRows] = useState<ClassFeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClassFeeRow | null>(null);
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState(thisMonth() < FINANCE_START_MONTH ? FINANCE_START_MONTH : thisMonth());
  const [notes, setNotes] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);

  const refresh = async () => { const data = await api.getClassFees(); setRows(data.classes); };
  useEffect(() => { refresh().catch(e => showToast(e.message, 'error')).finally(() => setLoading(false)); }, []);

  const startEdit = (row: ClassFeeRow) => {
    setEditing(row); setAmount(String(row.current_cents / 100)); setNotes(''); setKey(crypto.randomUUID());
    setMonth(thisMonth() < FINANCE_START_MONTH ? FINANCE_START_MONTH : thisMonth());
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const cents = amountToCents(amount);
    if (Number.isNaN(cents)) { showToast('Enter an amount like 100 or 100.50.', 'error'); return; }
    setBusy(true);
    try {
      const result = await api.saveClassFee(editing.class_id, { idempotency_key: key, amount_cents: cents, effective_month: month, ...(notes.trim() ? { notes: notes.trim() } : {}) });
      await refresh();
      setEditing(null);
      showToast(`${editing.class_name}: ${money(cents)} / ${unit(editing)} from ${monthLabel(month)}.${result.own_fee?.length ? ` ${result.own_fee.length} student(s) keep their own fee.` : ''}`, 'success');
    } catch (err: any) { showToast(err.message, 'error'); } finally { setBusy(false); }
  };

  const filtered = rows.filter(r => (showInactive || r.is_active) && `${r.class_name} ${r.coach_name}`.toLowerCase().includes(search.toLowerCase()));
  if (loading) return <p className="text-slate-500">Loading class fees…</p>;
  return <section className={card}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-bold">Class fees</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Set one fee for every student in a class. A student with their own fee (Override fee) keeps it. Classes with no class fee use the default (RM240 / month group, RM80 / lesson individual).</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" /><input className={`${field} pl-8 w-56`} placeholder="Search class or coach" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show closed classes</label>
      </div>
    </div>
    <div className="mt-4 divide-y divide-slate-100 dark:divide-neutral-800">
      {!filtered.length && <p className="py-6 text-center text-sm text-slate-500">No classes match.</p>}
      {filtered.map(r => <div key={r.class_id} className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold">{r.class_name}</p>
              <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:border-neutral-700 dark:text-slate-300">{r.billing_mode === 'MONTHLY' ? 'Monthly' : 'Per lesson'}</span>
              {!r.is_active && <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:border-neutral-700 dark:bg-neutral-800">Closed</span>}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{r.coach_name ? `Coach: ${r.coach_name} · ` : ''}{r.students} student{r.students === 1 ? '' : 's'}{r.own_fee.length ? ` · ${r.own_fee.length} with their own fee` : ''}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-bold">{money(r.current_cents)} / {unit(r)}</p>
              <p className={`text-[11px] font-semibold ${r.source === 'CLASS' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`}>{r.source === 'CLASS' ? 'class fee' : 'default'}</p>
              {r.upcoming.map(u => <p key={u.effective_month} className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">{money(u.amount_cents)} from {monthLabel(u.effective_month)}</p>)}
            </div>
            {r.history.length > 0 && <button className={minor} onClick={() => setOpen(open === r.class_id ? null : r.class_id)}>{open === r.class_id ? 'Hide history' : 'History'}</button>}
            <button className={button} onClick={() => startEdit(r)}>Set class fee</button>
          </div>
        </div>
        {open === r.class_id && <ul className="mt-2 space-y-1 rounded-xl bg-slate-50 p-3 text-xs dark:bg-neutral-800/60">
          {r.history.map(h => <li key={h.id}><span className="font-bold">{money(h.amount_cents)}</span> from {monthLabel(h.effective_month)} · set by {h.created_by_name || h.created_by_user_id} on {new Date(h.created_at).toLocaleDateString('en-MY')}{h.notes ? ` · ${h.notes}` : ''}</li>)}
        </ul>}
      </div>)}
    </div>

    <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Set class fee" subtitle={editing ? `${editing.class_name} · ${editing.billing_mode === 'MONTHLY' ? 'Monthly' : 'Per attended lesson'}` : undefined}>
      {editing && <form className="space-y-4 pt-4" onSubmit={submit}>
        <label className="block text-sm font-bold">Fee (RM) per {unit(editing)}<input className={field} required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label className="block text-sm font-bold">From month<input className={field} type="month" required min={FINANCE_START_MONTH} value={month} onChange={e => setMonth(e.target.value)} /></label>
        <label className="block text-sm font-bold">Note (optional)<input className={field} maxLength={500} placeholder="e.g. school rate agreed with SJK(C)" value={notes} onChange={e => setNotes(e.target.value)} /></label>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-bold">{editing.students - editing.own_fee.length} student{editing.students - editing.own_fee.length === 1 ? '' : 's'} will be charged this fee from {month ? monthLabel(month) : '—'} onward.</p>
          {editing.own_fee.length > 0 && <p className="mt-1">{editing.own_fee.length} keep their own fee: {editing.own_fee.map(s => s.full_name).join(', ')}.</p>}
          <p className="mt-1">Past months change too. If someone already paid more, the extra shows as credit for later months.</p>
        </div>
        <div className="flex justify-end gap-2"><button type="button" className={minor} onClick={() => setEditing(null)}>Cancel</button><button className={button} disabled={busy}>{busy ? 'Saving…' : 'Save class fee'}</button></div>
      </form>}
    </Modal>
  </section>;
};
