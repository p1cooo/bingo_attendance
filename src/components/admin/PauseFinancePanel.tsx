import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import type { StudentPause } from '../../types.js';
import { getTodayDateString } from '../../lib/dateUtils.js';

const labels = { EXAMINATION: 'Exams', HOLIDAY_TRAVEL: 'Holiday / travel', MEDICAL_HEALTH: 'Medical / health', PERSONAL: 'Personal', OTHER: 'Other' };
const historyLabels: Record<string, string> = { DECLARED: 'Pause set', RESUMED: 'Back in class', BILLING_REVIEWED: 'Month fee set' };
type FeeMonth = { month: string; class_dates: string[]; paused_dates: string[]; fee_cents: number | null };
type PauseRow = StudentPause & { class_name?: string; fee_months?: FeeMonth[] };

const money = (cents: number) => `RM${(cents / 100).toFixed(2)}`;
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const shortDate = (date: string) => new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const monthLabel = (month: string) => new Intl.DateTimeFormat('en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

export const PauseFinancePanel: React.FC = () => {
  const [pauses, setPauses] = useState<PauseRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [fees, setFees] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const today = getTodayDateString();
  const refresh = async () => {
    const [pauseData, students] = await Promise.all([api.getStudentPauses(), api.getFinanceStudents()]);
    setPauses(pauseData.pauses);
    setNames(Object.fromEntries(students.students.map((row: any) => [row.student.id, row.student.full_name])));
  };
  useEffect(() => { refresh().catch(e => setError(e.message)); }, []);
  const action = async (run: () => Promise<unknown>) => { setBusy(true); setError(''); try { await run(); await refresh(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const active = pauses.filter(p => p.start_date <= today && (!p.end_date || p.end_date >= today));
  const future = pauses.filter(p => p.start_date > today);
  const recentDate = new Date(`${today}T00:00:00Z`); recentDate.setUTCDate(recentDate.getUTCDate() - 30);
  const recent = pauses.filter(p => p.end_date && p.end_date < today && p.end_date >= recentDate.toISOString().slice(0, 10));
  const needFee = pauses.reduce((n, p) => n + (p.fee_months || []).filter(m => m.fee_cents === null).length, 0);
  const sorted = [...pauses].sort((a, b) => Number((b.fee_months || []).some(m => m.fee_cents === null)) - Number((a.fee_months || []).some(m => m.fee_cents === null)) || b.created_at.localeCompare(a.created_at));

  return <div className="space-y-4">
    <h3 className="text-base font-bold">Student pauses</h3>
    <p className="text-xs text-slate-500">A pause starts straight away when a coach sets it. Each month is billed by the student’s classes: no class paused = normal fee, every class paused = RM0, some classes paused = you set that month’s fee here.</p>
    {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-4">
      <p className="rounded-xl border p-3 text-xs">Paused now <b className="ml-1 text-sm">{active.length}</b></p>
      <p className="rounded-xl border p-3 text-xs">Starting later <b className="ml-1 text-sm">{future.length}</b></p>
      <p className="rounded-xl border p-3 text-xs">Back in last 30 days <b className="ml-1 text-sm">{recent.length}</b></p>
      <p className={`rounded-xl border p-3 text-xs ${needFee ? 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200' : ''}`}>Month fees to set <b className="ml-1 text-sm">{needFee}</b></p>
    </div>
    <div className="space-y-3">{sorted.map(p => {
      const status = p.start_date > today ? 'Starts later' : p.end_date && p.end_date < today ? 'Back in class' : 'Paused now';
      const tone = status === 'Paused now' ? 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300' : status === 'Back in class' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-slate-200 bg-slate-50 text-slate-700';
      return <section key={p.id} className="rounded-xl border p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><b>{names[p.student_id] || p.student_id} · {p.class_name || p.class_id}</b><span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{status}</span></div>
        <p className="mt-1 text-xs">{dateLabel(p.start_date)} – {p.end_date ? dateLabel(p.end_date) : 'no end date yet'} · {labels[p.reason]}{p.note ? ` · ${p.note}` : ''}</p>
        <p className="mt-1 text-xs text-slate-500">Set by {p.declared_by_role === 'COACH' ? 'Coach ' : ''}{p.declared_by_name} on {dateLabel(p.created_at.slice(0, 10))}</p>
        {Boolean(p.attendance_conflict_ids?.length) && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Note: {p.attendance_conflict_ids!.length === 1 ? '1 class' : `${p.attendance_conflict_ids!.length} classes`} inside this pause already had attendance marked. {p.attendance_conflict_ids!.length === 1 ? 'That mark was' : 'Those marks were'} kept.</p>}
        {(p.fee_months || []).map(m => {
          const key = `${p.id}:${m.month}`;
          const fee = fees[key] ?? '';
          const summary = `Paused for ${m.paused_dates.length} of ${m.class_dates.length} classes (${m.paused_dates.map(shortDate).join(', ')})`;
          return <div key={m.month} className={`mt-3 rounded-lg border p-3 text-xs ${m.fee_cents === null ? 'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200' : 'border-slate-200 bg-slate-50 dark:border-neutral-700 dark:bg-neutral-800/40'}`}>
            <p className="font-semibold">{monthLabel(m.month)}: {m.fee_cents === null ? 'set the fee' : `fee set to ${money(m.fee_cents)}`}</p>
            <p className="mt-0.5">{summary}.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input aria-label={`${monthLabel(m.month)} fee in RM`} className="w-28 rounded border bg-white p-1 text-xs text-slate-900" placeholder="RM" inputMode="decimal" value={fee} onChange={e => setFees(f => ({ ...f, [key]: e.target.value }))} />
              <button disabled={busy || !/^\d+(\.\d{1,2})?$/.test(fee)} className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-40" onClick={() => action(() => api.reviewStudentPauseBilling(p.id, m.month, Math.round(Number(fee) * 100)))}>{m.fee_cents === null ? 'Save fee' : 'Change fee'}</button>
            </div>
          </div>;
        })}
        {status === 'Paused now' && <div className="mt-3"><button disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={() => action(() => api.resumeStudentPause(p.id, today))}>Back in class from today</button></div>}
        <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">History</summary>{p.history.map((h, index) => <p key={index}>{dateLabel(h.at.slice(0, 10))} · {historyLabels[h.action] || h.action}{h.action === 'BILLING_REVIEWED' && h.details ? ` · ${monthLabel(h.details.split(':')[0])} ${money(Number(h.details.split(':')[1]))}` : ''}</p>)}</details>
      </section>;
    })}{!pauses.length && <p className="text-sm text-slate-500">No pauses yet.</p>}</div>
  </div>;
};
