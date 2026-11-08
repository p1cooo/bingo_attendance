import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { AlertCircle, CheckCircle2, Clock, CreditCard, School } from 'lucide-react';

export type MonthStatus = 'PAID' | 'PARTLY_PAID' | 'UNPAID' | 'CREDIT' | 'NEEDS_REVIEW' | 'NOT_BILLED_YET';
type Bucket = { students: number; cents: number };
type Overview = {
  month: string; billed_cents: number; billed_students: number; collected_cents: number; payments_count: number;
  still_to_collect_cents: number; total_outstanding_cents: number;
  status_counts: Record<MonthStatus, number>;
  ageing: { this_month_only: Bucket; one_behind: Bucket; two_plus: Bucket };
  to_do: { partial_months: number; trial_sessions: number; other_reviews: number; classes_without_roll_call: string[] };
  by_class: { class_name: string; cents: number }[];
  recent_payments: { student_id: string; student_name: string; student_code: string; amount_cents: number; method: string; payment_date: string }[];
};

const FINANCE_START_MONTH = '2026-11';
const money = (cents: number) => `RM${(cents / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (month: string) => new Intl.DateTimeFormat('en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const thisMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const prevMonth = (month: string) => { const [y, m] = month.split('-').map(Number); return `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`; };
const card = 'rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-5 shadow-2xs';
const row = 'flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-xs last:border-b-0 dark:border-neutral-800';

/** Order, label and colours for the "where every student stands" bar and pills. */
export const STATUS_INFO: { key: MonthStatus; label: string; bar: string; pill: string }[] = [
  { key: 'PAID', label: 'Paid in full', bar: 'bg-emerald-400 dark:bg-emerald-600', pill: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' },
  { key: 'CREDIT', label: 'Has credit', bar: 'bg-sky-400 dark:bg-sky-600', pill: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300' },
  { key: 'PARTLY_PAID', label: 'Partly paid', bar: 'bg-amber-300 dark:bg-amber-600', pill: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300' },
  { key: 'UNPAID', label: 'Not paid', bar: 'bg-rose-400 dark:bg-rose-600', pill: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300' },
  { key: 'NEEDS_REVIEW', label: 'Needs review', bar: 'bg-orange-400 dark:bg-orange-600', pill: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300' },
  { key: 'NOT_BILLED_YET', label: 'Not billed yet', bar: 'bg-slate-300 dark:bg-neutral-600', pill: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-300' },
];

type Props = { reloadKey: number; onOpenStudent: (id: string) => void; onShowStatus: (status: MonthStatus) => void; onShowOutstanding: () => void };

export const FinanceOverviewPanel: React.FC<Props> = ({ reloadKey, onOpenStudent, onShowStatus, onShowOutstanding }) => {
  const current = thisMonth() < FINANCE_START_MONTH ? FINANCE_START_MONTH : thisMonth();
  const [month, setMonth] = useState(current);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    api.getFinanceOverview(month).then(d => { if (live) setData(d); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [month, reloadKey]);

  const months: string[] = [];
  for (let m = current; m >= FINANCE_START_MONTH && months.length < 24; m = prevMonth(m)) months.push(m);
  const isCurrent = month === current;

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading overview…</p>;

  const paidTowardMonth = Math.max(0, data.billed_cents - data.still_to_collect_cents);
  const percent = data.billed_cents ? Math.round(paidTowardMonth / data.billed_cents * 100) : 0;
  const counted = STATUS_INFO.filter(s => data.status_counts[s.key] > 0);
  const totalCounted = counted.reduce((n, s) => n + data.status_counts[s.key], 0);
  const earlierOwed = data.total_outstanding_cents - data.still_to_collect_cents;
  const todo = [
    { label: 'Join/leave mid-month amounts to set', count: data.to_do.partial_months },
    { label: 'Trial sessions to price', count: data.to_do.trial_sessions },
    { label: 'Pauses covering some classes, and other checks', count: data.to_do.other_reviews },
    ...(isCurrent ? [{ label: 'Group classes with students not marked yet', count: data.to_do.classes_without_roll_call.length, hint: data.to_do.classes_without_roll_call.join(', ') }] : []),
  ];
  const ageing = [
    { label: 'This month only', b: data.ageing.this_month_only, tone: '' },
    { label: '1 month behind', b: data.ageing.one_behind, tone: 'text-amber-700 dark:text-amber-300' },
    { label: '2+ months behind', b: data.ageing.two_plus, tone: 'text-rose-700 dark:text-rose-300' },
  ];

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{monthLabel(month)}{isCurrent && <span className="ml-1 font-normal text-slate-500">so far</span>}</p>
      <select aria-label="Choose month" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold dark:border-neutral-700 dark:bg-neutral-800" value={month} onChange={e => setMonth(e.target.value)}>
        {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </select>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className={card}><p className="text-xs font-medium text-slate-500">Billed this month</p><p className="mt-2 text-2xl font-bold tracking-tight">{money(data.billed_cents)}</p><p className="mt-1 text-[11px] text-slate-500">{data.billed_students} student{data.billed_students === 1 ? '' : 's'} charged</p></div>
      <div className={card}><p className="text-xs font-medium text-slate-500">Collected this month</p><p className="mt-2 text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">{money(data.collected_cents)}</p><p className="mt-1 text-[11px] text-slate-500">{data.payments_count} payment{data.payments_count === 1 ? '' : 's'} received</p></div>
      <button className={`${card} text-left transition-colors hover:border-rose-300`} onClick={onShowOutstanding}><p className="text-xs font-medium text-slate-500">Still to collect</p><p className="mt-2 text-2xl font-bold tracking-tight text-rose-700 dark:text-rose-300">{money(data.still_to_collect_cents)}</p><p className="mt-1 text-[11px] text-slate-500">{earlierOwed > 0 ? `+ ${money(earlierOwed)} from earlier months` : 'for this month’s fees'}</p></button>
    </div>

    <div className={card}>
      <div className="flex justify-between text-xs"><span className="font-semibold">{monthLabel(month)} fees paid</span><span className="text-slate-500">{percent}% of {money(data.billed_cents)}</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-neutral-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} /></div>
    </div>

    <section className={card}>
      <h3 className="text-base font-bold">Where every student stands</h3>
      {totalCounted ? <div className="mt-3 flex h-3 overflow-hidden rounded-full" role="img" aria-label={counted.map(s => `${s.label} ${data.status_counts[s.key]}`).join(', ')}>
        {counted.map(s => <div key={s.key} className={s.bar} style={{ flex: data.status_counts[s.key] }} />)}
      </div> : <p className="mt-2 text-xs text-slate-500">No billable students this month.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {STATUS_INFO.map(s => {
          const pill = <><span>{s.label}</span><b className="ml-1.5">{data.status_counts[s.key]}</b></>;
          return isCurrent
            ? <button key={s.key} onClick={() => onShowStatus(s.key)} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-80 ${s.pill}`}>{pill}</button>
            : <span key={s.key} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${s.pill}`}>{pill}</span>;
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{isCurrent ? 'Click a group to see those students. ' : ''}“Not billed yet” = the coach hasn’t marked this student (Present, Late or Absent) in their group class yet this month. The fee starts at the first mark.</p>
    </section>

    <div className="grid gap-4 lg:grid-cols-2">
      <section className={`${card} border-amber-200/80 dark:border-amber-900`}>
        <h3 className="flex items-center gap-2 text-base font-bold"><AlertCircle className="h-4 w-4 text-amber-600" />To do</h3>
        <div className="mt-2">{todo.map(t => <div key={t.label} className={row} title={'hint' in t ? t.hint : undefined}><span className="text-slate-700 dark:text-slate-300">{t.label}</span><b className={t.count ? 'text-amber-700 dark:text-amber-300' : 'text-slate-400'}>{t.count}</b></div>)}</div>
        {isCurrent && data.to_do.classes_without_roll_call.length > 0 && <p className="mt-2 text-[11px] text-slate-500">Not marked yet this month: {data.to_do.classes_without_roll_call.slice(0, 6).join(', ')}{data.to_do.classes_without_roll_call.length > 6 ? ` +${data.to_do.classes_without_roll_call.length - 6} more` : ''}</p>}
        {(data.to_do.partial_months + data.to_do.trial_sessions + data.to_do.other_reviews) > 0 && <button className="mt-3 text-xs font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300" onClick={() => onShowStatus('NEEDS_REVIEW')}>Open students needing review →</button>}
      </section>

      <section className={card}>
        <h3 className="flex items-center gap-2 text-base font-bold"><Clock className="h-4 w-4 text-slate-500" />How late</h3>
        <div className="mt-2">{ageing.map(a => <div key={a.label} className={row}><span className="text-slate-700 dark:text-slate-300">{a.label}</span><span className={a.tone}><b>{a.b.students}</b> student{a.b.students === 1 ? '' : 's'} · {money(a.b.cents)}</span></div>)}</div>
        <p className="mt-2 text-[11px] text-slate-500">Counts unpaid months up to {monthLabel(month)}.</p>
      </section>

      <section className={card}>
        <h3 className="flex items-center gap-2 text-base font-bold"><School className="h-4 w-4 text-slate-500" />Owed by class</h3>
        <div className="mt-2">{data.by_class.map(c => <div key={c.class_name} className={row}><span className="truncate text-slate-700 dark:text-slate-300">{c.class_name}</span><b>{money(c.cents)}</b></div>)}
          {!data.by_class.length && <p className="flex items-center gap-2 py-2 text-xs text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Nothing owed for this month.</p>}</div>
        {data.by_class.length > 0 && <p className="mt-2 text-[11px] text-slate-500">Top 5 classes by unpaid {monthLabel(month)} fees.</p>}
      </section>

      <section className={card}>
        <h3 className="flex items-center gap-2 text-base font-bold"><CreditCard className="h-4 w-4 text-slate-500" />Recent payments</h3>
        <div className="mt-2">{data.recent_payments.map((p, i) => <button key={`${p.student_id}-${i}`} onClick={() => onOpenStudent(p.student_id)} className={`${row} w-full text-left hover:bg-slate-50 dark:hover:bg-neutral-800`}>
          <span><b>{p.student_name}</b><small className="block text-slate-500">{p.method} · {dateLabel(p.payment_date)}</small></span><b className="text-emerald-700 dark:text-emerald-300">{money(p.amount_cents)}</b></button>)}
          {!data.recent_payments.length && <p className="py-2 text-xs text-slate-500">No payments recorded yet. They’ll show here with the amount and method.</p>}</div>
      </section>
    </div>
  </div>;
};
