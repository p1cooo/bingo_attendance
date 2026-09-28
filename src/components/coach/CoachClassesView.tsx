import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { AcademyClass, ClassType } from '../../types.js';
import { Modal } from '../common/Modal.js';
import { useToast } from '../common/Toast.js';

const empty = { name: '', class_type: 'GROUP' as ClassType, day_of_week: 6, start_time: '09:30', end_time: '11:00', room_location: 'Chess Hall A' };
type Candidate = { id: string; full_name: string; student_id: string; already_in_class: boolean; assigned_elsewhere: boolean };

export const CoachClassesView: React.FC = () => {
  const { showToast } = useToast();
  const [classes, setClasses] = useState<AcademyClass[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<AcademyClass | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [roster, setRoster] = useState<AcademyClass | null>(null);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try { setClasses(await api.getClasses()); }
    catch (error: any) { showToast(error.message || 'Could not load classes', 'error'); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!roster || query.trim().length < 2) { setCandidates([]); return; }
    let active = true;
    api.searchClassStudents(roster.id, query).then((rows) => { if (active) setCandidates(rows); }).catch(() => { if (active) setCandidates([]); });
    return () => { active = false; };
  }, [roster?.id, query]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      if (editing) await api.updateClass(editing.id, form);
      else await api.createClass(form);
      setFormOpen(false); await load(); showToast('Class saved', 'success');
    } catch (error: any) { showToast(error.message || 'Could not save class', 'error'); }
    finally { setBusy(false); }
  };
  const archive = async (cls: AcademyClass) => {
    if (!window.confirm('Delete this class? Historical attendance will remain in reports.')) return;
    try { await api.deleteClass(cls.id); await load(); showToast('Class deleted; history preserved', 'success'); }
    catch (error: any) { showToast(error.message || 'Could not delete class', 'error'); }
  };
  const add = async (student: Candidate) => {
    if (student.already_in_class || !roster) return;
    if (student.assigned_elsewhere && !window.confirm('This student is already assigned to another class/coach. Add anyway?')) return;
    try {
      await api.addStudentToClass(roster.id, student.id, student.assigned_elsewhere);
      setCandidates((rows) => rows.map((row) => row.id === student.id ? { ...row, already_in_class: true } : row));
      showToast('Student added to class', 'success');
    } catch (error: any) { showToast(error.message || 'Could not add student', 'error'); }
  };
  return <main className="mx-auto max-w-6xl p-5 text-slate-950">
    <header className="mb-5 flex items-center justify-between"><h2 className="text-2xl font-black">My Classes</h2><button onClick={() => { setEditing(null); setForm(empty); setFormOpen(true); }} className="rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-xs font-black">Create Class</button></header>
    <section className="space-y-3">{classes.map((cls) => <article key={cls.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-slate-900 bg-white p-4 shadow-[4px_4px_0_#e2e8f0]">
      <div><h3 className="font-black">{cls.name}</h3><p className="text-xs text-slate-500">{cls.class_type} · {cls.start_time}–{cls.end_time} · {cls.enrolled_students_count || 0} students</p></div>
      <div className="flex gap-2"><button onClick={() => { setEditing(cls); setForm({ name: cls.name, class_type: cls.class_type, day_of_week: cls.day_of_week || 0, start_time: cls.start_time || '', end_time: cls.end_time || '', room_location: cls.room_location || '' }); setFormOpen(true); }} className="rounded-lg border border-slate-900 px-3 py-2 text-xs font-black">Edit</button><button onClick={() => { setRoster(cls); setQuery(''); }} className="rounded-lg border border-slate-900 px-3 py-2 text-xs font-black">Add Students</button><button onClick={() => archive(cls)} className="rounded-lg border border-rose-600 px-3 py-2 text-xs font-black text-rose-700">Delete</button></div>
    </article>)}</section>
    <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit Class' : 'Create Class'}>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-xs font-bold">Class name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="block text-xs font-bold">Type<select value={form.class_type} onChange={(event) => setForm({ ...form, class_type: event.target.value as ClassType })} className="mt-1 w-full rounded-lg border p-2"><option>GROUP</option><option>INDIVIDUAL</option></select></label>
        <label className="block text-xs font-bold">Day<select value={form.day_of_week} onChange={(event) => setForm({ ...form, day_of_week: Number(event.target.value) })} className="mt-1 w-full rounded-lg border p-2">{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
        <label className="block text-xs font-bold">Start<input type="time" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="block text-xs font-bold">End<input type="time" value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="block text-xs font-bold">Room<input value={form.room_location} onChange={(event) => setForm({ ...form, room_location: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Save Class</button>
      </form>
    </Modal>
    <Modal isOpen={Boolean(roster)} onClose={() => setRoster(null)} title="Add Students to Class">
      <input aria-label="Search academy students" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or STU-ID" className="mb-3 w-full rounded-lg border p-2 text-sm" />
      <div className="space-y-2">{candidates.map((student) => <button key={student.id} disabled={student.already_in_class} onClick={() => add(student)} className="flex w-full items-center justify-between rounded-lg border p-2 text-left text-sm disabled:bg-slate-100 disabled:text-slate-400"><span>{student.full_name} ({student.student_id})</span><span>{student.already_in_class ? 'Already in class' : 'Add'}</span></button>)}</div>
    </Modal>
  </main>;
};
