import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { ClassSchedule, Student } from '../../types.js';
import { Modal } from '../common/Modal.js';
import { useToast } from '../common/Toast.js';
import { CoachFilterChip } from './CoachFilterChip.js';
import { BingoSpaceAccountSection } from '../student/BingoSpaceAccountSection.js';
import { CoachStudentRow, CreditFilter, LinkFilter, WEEK_DAYS, filterCoachStudents } from '../../lib/coachListFilters.js';
import { ClassMembershipPicker } from '../student/ClassMembershipPicker.js';

const emptyForm = { full_name: '', nick_name: '', school: '', parent_name: '', parent_phone: '', parent_email: '', parent_relation: 'Parent' };

export const CoachStudentsView: React.FC = () => {
  const { showToast } = useToast();
  const [students, setStudents] = useState<CoachStudentRow[]>([]);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [query, setQuery] = useState('');
  const [creditFilter, setCreditFilter] = useState<CreditFilter>('ALL');
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('ALL');
  const [days, setDays] = useState<number[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<(Student & { attendance_history?: any[] }) | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [scheduleIds, setScheduleIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const [rows, assigned] = await Promise.all([api.getStudents(), api.getSchedules()]);
      setStudents(rows as unknown as CoachStudentRow[]);
      setSchedules(assigned);
    } catch (error: any) { showToast(error.message || 'Could not load students', 'error'); }
  };
  useEffect(() => { load(); }, []);
  const visible = useMemo(() => filterCoachStudents(students, { query, credit: creditFilter, link: linkFilter, days }), [students, query, creditFilter, linkFilter, days]);
  const resetFilters = () => { setQuery(''); setCreditFilter('ALL'); setLinkFilter('ALL'); setDays([]); };
  const toggleDay = (day: number) => setDays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day]);
  const openStudent = async (id: string, edit = false) => {
    try {
      const student = await api.getStudent(id);
      setSelected(student);
      setForm({
        full_name: student.full_name, nick_name: student.nick_name || '', school: student.school || '',
        parent_name: student.parent?.name || '', parent_phone: student.parent?.phone || '',
        parent_email: student.parent?.email || '', parent_relation: student.parent_relation || 'Parent',
      });
      setEditing(edit);
      setScheduleIds(student.enrolled_schedules?.map((schedule) => schedule.schedule_id)
        .filter((scheduleId) => schedules.some((schedule) => schedule.id === scheduleId)) || []);
    } catch (error: any) { showToast(error.message || 'Could not open student', 'error'); }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (selected) await api.updateStudent(selected.id, { ...form, schedule_ids: scheduleIds });
      else await api.createStudent({ ...form, schedule_ids: scheduleIds });
      setEditing(false); setSelected(null); setForm(emptyForm);
      await load();
      showToast('Student saved', 'success');
    } catch (error: any) { showToast(error.message || 'Could not save student', 'error'); }
    finally { setBusy(false); }
  };
  const invite = async (student: CoachStudentRow) => {
    try {
      const result = await api.createPortalInvite(student.id);
      if (result.status === 'REGISTERED') { showToast('Linked to Bingo Space', 'success'); await load(); return; }
      const link = result.invite_url || result.portal_url;
      if (!link) throw new Error('No invite link returned');
      setLinks((current) => ({ ...current, [student.id]: link }));
      await navigator.clipboard.writeText(link);
      showToast('Bingo Space link copied', 'success');
    } catch (error: any) { showToast(error.message || 'Could not copy link', 'error'); }
  };
  return <main className="mx-auto max-w-6xl p-5 text-slate-950">
    <header className="mb-5 flex items-center justify-between">
      <div><h2 className="text-2xl font-black tracking-tight">My Students</h2><p className="text-sm text-slate-500">Students in your normal classes.</p></div>
      <button className="rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-xs font-black" onClick={() => { setSelected(null); setForm(emptyForm); setScheduleIds([]); setEditing(true); }}>Add Student</button>
    </header>
    <input aria-label="Search student name or Attendance student ID" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or Attendance ID (STU-0001)" className="mb-3 w-full rounded-xl border-2 border-slate-900 bg-white p-3 text-sm" />
    <div className="mb-4 space-y-2">
      <div aria-label="Student credit and link filters" className="overflow-x-auto pb-1"><div className="flex w-max gap-2">
        <CoachFilterChip label="All" active={!query && creditFilter === 'ALL' && linkFilter === 'ALL' && days.length === 0} onClick={resetFilters} />
        <CoachFilterChip label="Has Credit" active={creditFilter === 'POSITIVE'} onClick={() => setCreditFilter((current) => current === 'POSITIVE' ? 'ALL' : 'POSITIVE')} />
        <CoachFilterChip label="Negative Credit" active={creditFilter === 'NEGATIVE'} onClick={() => setCreditFilter((current) => current === 'NEGATIVE' ? 'ALL' : 'NEGATIVE')} />
        <CoachFilterChip label="Linked" active={linkFilter === 'REGISTERED'} onClick={() => setLinkFilter((current) => current === 'REGISTERED' ? 'ALL' : 'REGISTERED')} />
        <CoachFilterChip label="Not Linked" active={linkFilter === 'NOT_REGISTERED'} onClick={() => setLinkFilter((current) => current === 'NOT_REGISTERED' ? 'ALL' : 'NOT_REGISTERED')} />
      </div></div>
      <div aria-label="Normal class day filters" className="overflow-x-auto pb-1"><div className="flex w-max gap-2">
        {WEEK_DAYS.map((day) => <CoachFilterChip key={day.value} label={day.short} active={days.includes(day.value)} onClick={() => toggleDay(day.value)} />)}
      </div></div>
    </div>
    <section className="space-y-3">{visible.length === 0 && <p className="rounded-2xl border-2 border-slate-900 bg-white p-4 text-sm font-bold text-slate-500">No students match your search and filters.</p>}{visible.map((student) => <article key={student.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-slate-900 bg-white p-4 shadow-[4px_4px_0_#e2e8f0]">
      <div><h3 className="font-black">{student.full_name}</h3><p className="text-xs text-slate-500">{student.student_id} · {student.replacement_credits} replacement credits</p></div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => openStudent(student.id)} className="rounded-lg border border-slate-900 px-3 py-2 text-xs font-black">View</button>
        <button onClick={() => openStudent(student.id, true)} className="rounded-lg border border-slate-900 px-3 py-2 text-xs font-black">Edit</button>
        {student.portal_account_status === 'REGISTERED' ? <span className="rounded-lg bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800">Linked</span> :
          student.portal_account_status === 'NOT_REGISTERED' ? <button onClick={() => links[student.id] ? navigator.clipboard.writeText(links[student.id]).then(() => showToast('Link copied', 'success')) : invite(student)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white">Copy Link</button> :
          <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black">Status unavailable</span>}
      </div>
    </article>)}</section>
    <Modal isOpen={editing} onClose={() => { setEditing(false); setSelected(null); }} title={selected ? 'Edit Student Details' : 'Add Student'}>
      <form onSubmit={save} className="space-y-3">
        {Object.entries(form).map(([key, value]) => <label key={key} className="block text-xs font-bold capitalize">{key.replaceAll('_', ' ')}
          <input required={key === 'full_name'} value={value} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
        </label>)}
        <ClassMembershipPicker schedules={schedules} selected={scheduleIds} onChange={setScheduleIds} />
        <button disabled={busy || (!selected && !scheduleIds.length)} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Save Student</button>
      </form>
    </Modal>
    <Modal isOpen={Boolean(selected) && !editing} onClose={() => setSelected(null)} title="Student Details">
      {selected && <div className="space-y-2 text-sm"><p><b>{selected.full_name}</b> ({selected.student_id})</p><p>Nickname: {selected.nick_name || '—'}</p><p>School: {selected.school || '—'}</p><p>Parent: {selected.parent?.name || '—'}</p><p>Phone: {selected.parent?.phone || '—'}</p><p>Classes: {selected.enrolled_schedules?.map((item) => item.class_name).join(', ') || '—'}</p><BingoSpaceAccountSection student={selected} /></div>}
    </Modal>
  </main>;
};
