import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import type { StudentPause } from '../../types.js';
import { getTodayDateString } from '../../lib/dateUtils.js';

const labels = { EXAMINATION: 'Examination', HOLIDAY_TRAVEL: 'Holiday / Travel', MEDICAL_HEALTH: 'Medical / Health', PERSONAL: 'Personal', OTHER: 'Other' };

export const PauseFinancePanel: React.FC = () => {
  const [pauses, setPauses] = useState<Array<StudentPause & { class_name?: string }>>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [reviewInputs, setReviewInputs] = useState<Record<string, { month: string; fee: string }>>({});
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
  const updateReviewInput = (pause: StudentPause, patch: Partial<{ month: string; fee: string }>) =>
    setReviewInputs(current => ({ ...current, [pause.id]: { month: pause.start_date.slice(0, 7), fee: '', ...current[pause.id], ...patch } }));
  const active = pauses.filter(p => p.start_date <= today && (!p.end_date || p.end_date >= today));
  const future = pauses.filter(p => p.start_date > today);
  const recentDate = new Date(`${today}T00:00:00Z`); recentDate.setUTCDate(recentDate.getUTCDate() - 30);
  const recent = pauses.filter(p => p.end_date && p.end_date < today && p.end_date >= recentDate.toISOString().slice(0, 10));
  return <div className="space-y-4">
    <h3 className="text-base font-bold">Student pauses and Finance review</h3>
    <p className="text-xs text-slate-500">Coach declarations take effect immediately. Partial months need a custom class fee before billing is final.</p>
    {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-3"><p className="rounded-xl border p-3">Active pauses <b>{active.length}</b></p><p className="rounded-xl border p-3">Future pauses <b>{future.length}</b></p><p className="rounded-xl border p-3">Recently resumed <b>{recent.length}</b></p></div>
    <div className="space-y-3">{[...pauses].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(p => {
      const status = p.start_date > today ? 'Future' : p.end_date && p.end_date < today ? 'Resumed' : 'Active';
      const { month, fee } = reviewInputs[p.id] || { month: p.start_date.slice(0, 7), fee: '' };
      const monthEnd = `${month}-${new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()}`;
      const pending = !p.billing_reviews?.[month] && p.start_date <= monthEnd && (!p.end_date || p.end_date >= `${month}-01`) && !(p.start_date <= `${month}-01` && (!p.end_date || p.end_date >= monthEnd));
      return <section key={p.id} className="rounded-xl border p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><b>{names[p.student_id] || p.student_id} · {p.class_name || p.class_id}</b><span>{status}{p.end_date === null ? ' · Until Further Notice' : ''}</span></div>
        <p className="mt-1 text-xs">{p.start_date}–{p.end_date || 'open'} · {labels[p.reason]}{p.note ? ` · ${p.note}` : ''}</p>
        <p className="mt-1 text-xs text-slate-500">Declared by {p.declared_by_name} ({p.declared_by_role}) · {p.created_at.slice(0, 10)} · Enrollment {p.membership_id}</p>
        {p.declared_by_role === 'COACH' && <p className="mt-1 text-xs font-bold text-amber-700">Coach declaration · Finance review notification</p>}
        {Boolean(p.attendance_conflict_ids?.length) && <p className="mt-1 text-xs font-bold text-rose-700">{p.attendance_conflict_ids!.length} existing attendance mark(s) need manual review. Historical marks were preserved.</p>}
        {pending && <p className="mt-1 text-xs font-bold text-amber-700">Pending Finance Review for {month}</p>}
        {p.billing_reviews?.[month] && <p className="mt-1 text-xs font-bold">Custom {month} fee: RM{(p.billing_reviews[month].amount_cents / 100).toFixed(2)}</p>}
        <div className="mt-3 flex flex-wrap gap-2"><input aria-label="Review month" type="month" className="rounded border p-1 text-xs" value={month} onChange={e => updateReviewInput(p, { month: e.target.value })} /><input aria-label="Custom class fee in RM" className="w-28 rounded border p-1 text-xs" placeholder="Custom RM" value={fee} onChange={e => updateReviewInput(p, { fee: e.target.value })} /><button disabled={busy || !pending && !p.billing_reviews?.[month] || !/^\d+(\.\d{1,2})?$/.test(fee)} className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-40" onClick={() => action(() => api.reviewStudentPauseBilling(p.id, month, Math.round(Number(fee) * 100)))}>Save custom fee</button>
        {status === 'Active' && <button disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={() => action(() => api.resumeStudentPause(p.id, today))}>Resume today</button>}</div>
        <details className="mt-2 text-xs"><summary>History</summary>{p.history.map((h, index) => <p key={index}>{h.at.slice(0, 10)} · {h.action} · {h.user_id} {h.details}</p>)}</details>
      </section>;
    })}{!pauses.length && <p className="text-sm text-slate-500">No pause declarations yet.</p>}</div>
  </div>;
};
