import React, { useEffect, useMemo, useState } from 'react';
import { api, type UnregisteredStudentRow } from '../../lib/api.js';
import { formatMalaysianPhone, isValidMalaysianMobile } from '../../lib/phone.js';
import type { ClassSchedule, Coach } from '../../types.js';
import { Modal } from '../common/Modal.js';
import { useToast } from '../common/Toast.js';
import { ClassMembershipPicker } from '../student/ClassMembershipPicker.js';
import { ClassStartDateField } from '../student/ClassStartDateField.js';
import { getTodayDateString } from '../../lib/dateUtils.js';

const emptyForm = { full_name: '', nick_name: '', school: '', parent_name: '', parent_phone: '' };
const labels: Record<keyof typeof emptyForm, string> = {
  full_name: 'Full name', nick_name: 'Nickname', school: 'School', parent_name: 'Parent name', parent_phone: 'Parent phone',
};

type Done = { name: string; code: string; className?: string; link?: string; linkError?: string };

/**
 * Unregistered (UNREG-) walk-in students with Register / Remove.
 * Coach mode: only walk-ins the coach recorded, always shown.
 * Admin mode: every walk-in, collapsed by default with search + coach filter.
 */
export const UnregisteredStudentsSection: React.FC<{
  onRegistered: () => void | Promise<void>;
  /** Classes the user may pick when the walk-in's own class no longer exists. */
  schedules: ClassSchedule[];
  admin?: boolean;
  coaches?: Coach[];
}> = ({ onRegistered, schedules, admin = false, coaches = [] }) => {
  const { showToast } = useToast();
  const [rows, setRows] = useState<UnregisteredStudentRow[]>([]);
  const [target, setTarget] = useState<UnregisteredStudentRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [scheduleIds, setScheduleIds] = useState<string[]>([]);
  const [classStartDate, setClassStartDate] = useState(getTodayDateString());
  const [removing, setRemoving] = useState<UnregisteredStudentRow | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [search, setSearch] = useState('');
  const [coachFilter, setCoachFilter] = useState('');

  const load = async () => {
    try { setRows(await api.getUnregisteredStudents()); }
    catch (error: any) { showToast(error.message || 'Could not load unregistered students', 'error'); }
  };
  useEffect(() => { load(); }, []);

  const pickable = useMemo(() => schedules.filter((schedule) => schedule.is_active && schedule.class_item?.is_active !== false), [schedules]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => (!query || `${row.full_name} ${row.nick_name || ''} ${row.student_id} ${row.class_name || ''}`.toLowerCase().includes(query)) &&
      (!coachFilter || row.recorded_by_coach_id === coachFilter));
  }, [rows, search, coachFilter]);

  const open = (row: UnregisteredStudentRow) => {
    setTarget(row); setScheduleIds([]); setClassStartDate(getTodayDateString());
    setForm({ ...emptyForm, full_name: row.full_name, nick_name: row.nick_name || '', parent_phone: row.parent_phone || '' });
  };

  const register = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!target || busy) return;
    if (!form.full_name.trim()) { showToast('Full name is required', 'error'); return; }
    if (form.parent_phone.trim() && !isValidMalaysianMobile(form.parent_phone)) { showToast('Enter a valid Malaysian mobile number, or leave it empty', 'error'); return; }
    if (!target.class_active && !scheduleIds.length) { showToast('Choose a class for this student', 'error'); return; }
    setBusy(true);
    try {
      const student = await api.convertUnregisteredStudent(target.id, {
        full_name: form.full_name.trim(),
        nick_name: form.nick_name.trim() || undefined,
        school: form.school.trim() || undefined,
        parent_name: form.parent_name.trim() || undefined,
        parent_phone: form.parent_phone.trim() || undefined,
        schedule_ids: target.class_active ? undefined : scheduleIds,
        class_start_date: classStartDate,
      });
      const className = target.class_active ? target.class_name
        : pickable.filter((schedule) => scheduleIds.includes(schedule.id)).map((schedule) => schedule.class_item?.name || 'Class').join(', ');
      const result: Done = { name: student.full_name, code: student.student_id, className };
      try {
        const portal = await api.createPortalInvite(student.id);
        result.link = portal.invite_url || portal.portal_url;
        if (portal.status === 'REGISTERED') result.linkError = 'This student already has a Bingo Space account.';
      } catch (error: any) {
        result.linkError = error.message || 'Could not create the Bingo Space link.';
      }
      setTarget(null); setForm(emptyForm); setDone(result);
      await Promise.all([load(), onRegistered()]);
    } catch (error: any) { showToast(error.message || 'Could not register student', 'error'); }
    finally { setBusy(false); }
  };

  const remove = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!removing || busy) return;
    if (reason.trim().length < 3) { showToast('Please give a reason', 'error'); return; }
    setBusy(true);
    try {
      await api.markDidNotJoin(removing.id, reason.trim());
      showToast(`${removing.full_name} marked as did not join`, 'success');
      setRemoving(null); setReason('');
      await load();
    } catch (error: any) { showToast(error.message || 'Could not remove student', 'error'); }
    finally { setBusy(false); }
  };

  const copy = (link: string) => navigator.clipboard.writeText(link)
    .then(() => showToast('Bingo Space link copied', 'success'))
    .catch(() => showToast('Could not copy. Select the link and copy it manually.', 'error'));

  const list = <div className="space-y-2">{visible.map((row) => <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-white p-3 text-slate-950">
    <div className="min-w-0">
      <p className="break-words font-black">{row.full_name}{row.nick_name ? <span className="font-bold text-slate-500"> ({row.nick_name})</span> : null}</p>
      <p className="text-xs text-slate-500">{row.student_id}{row.class_name ? ` · ${row.class_name}` : ''}{!row.class_active ? ' (class no longer exists)' : ''}{row.first_visit_date ? ` · first came ${row.first_visit_date}` : ''}{row.visit_count > 1 ? ` · ${row.visit_count} visits` : ''}{admin && row.recorded_by_name ? ` · recorded by ${row.recorded_by_name}` : ''}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <button onClick={() => open(row)} className="min-h-10 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white">Register as official student</button>
      <button onClick={() => { setRemoving(row); setReason(''); }} className="min-h-10 rounded-lg border-2 border-rose-600 bg-white px-3 py-2 text-xs font-black text-rose-700">Remove</button>
    </div>
  </article>)}{!visible.length && <p className="rounded-xl bg-white p-3 text-xs font-bold text-slate-500">No unregistered students match.</p>}</div>;

  return <>
    {admin ? <details className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-slate-950">
      <summary className="cursor-pointer font-black">Unregistered students ({rows.length}) <span className="text-xs font-bold text-slate-600">— Show</span></summary>
      <p className="mb-3 mt-1 text-xs text-slate-600">Walk-ins still waiting. Register them when they sign up, or remove them if they did not join (their attendance and trial fees stay).</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <input aria-label="Search unregistered students" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, UNREG ID or class" className="min-w-0 flex-1 rounded-lg border-2 border-slate-900 bg-white p-2 text-sm" />
        <select aria-label="Recorded by coach" value={coachFilter} onChange={(event) => setCoachFilter(event.target.value)} className="rounded-lg border-2 border-slate-900 bg-white p-2 text-xs font-bold">
          <option value="">All coaches</option>{coaches.map((coach) => <option key={coach.id} value={coach.id}>Coach {coach.name}</option>)}
        </select>
      </div>
      {list}
    </details>
      : rows.length > 0 && <section aria-label="Unregistered students you recorded" className="mb-5 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4">
        <h3 className="font-black">Unregistered students you recorded</h3>
        <p className="mb-3 text-xs text-slate-600">Register them when they sign up, or remove them if they did not join (their attendance stays).</p>
        {list}
      </section>}

    <Modal isOpen={Boolean(target)} onClose={() => !busy && setTarget(null)} title="Register as Official Student">
      {target && <form onSubmit={register} className="space-y-3">
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
          {target.class_active ? <p>Joins class: <b>{target.class_name || 'the class they walked into'}</b></p>
            : <p className="font-bold text-amber-800">The class they walked into ({target.class_name || 'unknown'}) no longer exists. Choose a class below.</p>}
          <p>Student ID: <b>given automatically</b> (replaces {target.student_id})</p>
          <p>Their attendance so far stays on their record.</p>
        </div>
        {(Object.keys(emptyForm) as Array<keyof typeof emptyForm>).map((key) => <label key={key} className="block text-xs font-bold">{labels[key]}{key === 'full_name' ? ' *' : ' (optional)'}
          <input required={key === 'full_name'} value={form[key]} inputMode={key === 'parent_phone' ? 'tel' : undefined}
            onChange={(event) => { const value = key === 'parent_phone' ? formatMalaysianPhone(event.target.value) : event.target.value; setForm((current) => ({ ...current, [key]: value })); }}
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
        </label>)}
        {!target.class_active && <ClassMembershipPicker schedules={pickable} coaches={coaches} admin={admin} selected={scheduleIds} onChange={setScheduleIds} />}
        <ClassStartDateField value={classStartDate} onChange={setClassStartDate} />
        <button disabled={busy || !form.full_name.trim() || (!target.class_active && !scheduleIds.length)} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-40">{busy ? 'Registering…' : 'Register student'}</button>
      </form>}
    </Modal>

    <Modal isOpen={Boolean(removing)} onClose={() => !busy && setRemoving(null)} title="Remove Unregistered Student">
      {removing && <form onSubmit={remove} className="space-y-3 text-sm">
        <p><b>{removing.full_name}</b> ({removing.student_id})</p>
        <p className="text-xs text-slate-600">They will be marked as <b>did not join</b> and hidden from this list. Nothing is deleted: their attendance and any trial fee stay. If they come back later, record them again as a new walk-in.</p>
        <label className="block text-xs font-bold">Reason *
          <input required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. did not continue after trial" className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
        </label>
        <button disabled={busy || reason.trim().length < 3} className="rounded-lg bg-rose-700 px-4 py-2 text-xs font-black text-white disabled:opacity-40">{busy ? 'Removing…' : 'Remove (did not join)'}</button>
      </form>}
    </Modal>

    <Modal isOpen={Boolean(done)} onClose={() => setDone(null)} title="Student Registered">
      {done && <div className="space-y-3 text-sm">
        <p><b>{done.name}</b> is now an official student: <b>{done.code}</b>{done.className ? <> in <b>{done.className}</b></> : null}.</p>
        {done.link && !done.linkError && <div className="space-y-2">
          <p className="text-xs font-bold">Send this Bingo Space sign-up link to the parent:</p>
          <input readOnly value={done.link} onFocus={(event) => event.target.select()} aria-label="Bingo Space sign-up link" className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs" />
          <button onClick={() => copy(done.link!)} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white">Copy link</button>
        </div>}
        {done.linkError && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">{done.linkError} You can get the link later with "Copy Link" next to the student in My Students.</p>}
      </div>}
    </Modal>
  </>;
};
