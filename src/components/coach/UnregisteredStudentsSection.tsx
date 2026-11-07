import React, { useEffect, useState } from 'react';
import { api, type UnregisteredStudentRow } from '../../lib/api.js';
import { formatMalaysianPhone, isValidMalaysianMobile } from '../../lib/phone.js';
import { Modal } from '../common/Modal.js';
import { useToast } from '../common/Toast.js';

const emptyForm = { full_name: '', nick_name: '', school: '', parent_name: '', parent_phone: '' };
const labels: Record<keyof typeof emptyForm, string> = {
  full_name: 'Full name', nick_name: 'Nickname', school: 'School', parent_name: 'Parent name', parent_phone: 'Parent phone',
};

type Done = { name: string; code: string; className?: string; link?: string; linkError?: string };

// Unregistered (UNREG-) students the signed-in coach recorded during roll call,
// with a way to make them official students and get their Bingo Space link.
export const UnregisteredStudentsSection: React.FC<{ onRegistered: () => void | Promise<void> }> = ({ onRegistered }) => {
  const { showToast } = useToast();
  const [rows, setRows] = useState<UnregisteredStudentRow[]>([]);
  const [target, setTarget] = useState<UnregisteredStudentRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  const load = async () => {
    try { setRows(await api.getUnregisteredStudents()); }
    catch (error: any) { showToast(error.message || 'Could not load unregistered students', 'error'); }
  };
  useEffect(() => { load(); }, []);

  const open = (row: UnregisteredStudentRow) => {
    setTarget(row);
    setForm({ ...emptyForm, full_name: row.full_name, nick_name: row.nick_name || '', parent_phone: row.parent_phone || '' });
  };

  const register = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!target || busy) return;
    if (!form.full_name.trim()) { showToast('Full name is required', 'error'); return; }
    if (form.parent_phone.trim() && !isValidMalaysianMobile(form.parent_phone)) { showToast('Enter a valid Malaysian mobile number, or leave it empty', 'error'); return; }
    setBusy(true);
    try {
      const student = await api.convertUnregisteredStudent(target.id, {
        full_name: form.full_name.trim(),
        nick_name: form.nick_name.trim() || undefined,
        school: form.school.trim() || undefined,
        parent_name: form.parent_name.trim() || undefined,
        parent_phone: form.parent_phone.trim() || undefined,
      });
      const result: Done = { name: student.full_name, code: student.student_id, className: target.class_name };
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

  const copy = (link: string) => navigator.clipboard.writeText(link)
    .then(() => showToast('Bingo Space link copied', 'success'))
    .catch(() => showToast('Could not copy. Select the link and copy it manually.', 'error'));

  return <>
    {rows.length > 0 && <section aria-label="Unregistered students you recorded" className="mb-5 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4">
      <h3 className="font-black">Unregistered students you recorded</h3>
      <p className="mb-3 text-xs text-slate-600">When one of them signs up, register them here to give them a STU number and a Bingo Space link.</p>
      <div className="space-y-2">{rows.map((row) => <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-white p-3">
        <div className="min-w-0">
          <p className="break-words font-black">{row.full_name}{row.nick_name ? <span className="font-bold text-slate-500"> ({row.nick_name})</span> : null}</p>
          <p className="text-xs text-slate-500">{row.student_id}{row.class_name ? ` · ${row.class_name}` : ''}{row.first_visit_date ? ` · first came ${row.first_visit_date}` : ''}{row.visit_count > 1 ? ` · ${row.visit_count} visits` : ''}</p>
        </div>
        {row.class_active
          ? <button onClick={() => open(row)} className="min-h-10 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white">Register as official student</button>
          : <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">Class no longer active — ask an admin</span>}
      </article>)}</div>
    </section>}

    <Modal isOpen={Boolean(target)} onClose={() => !busy && setTarget(null)} title="Register as Official Student">
      {target && <form onSubmit={register} className="space-y-3">
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
          <p>Joins class: <b>{target.class_name || 'the class they walked into'}</b></p>
          <p>Student ID: <b>given automatically</b> (replaces {target.student_id})</p>
          <p>Their attendance so far stays on their record.</p>
        </div>
        {(Object.keys(emptyForm) as Array<keyof typeof emptyForm>).map((key) => <label key={key} className="block text-xs font-bold">{labels[key]}{key === 'full_name' ? ' *' : ' (optional)'}
          <input required={key === 'full_name'} value={form[key]} inputMode={key === 'parent_phone' ? 'tel' : undefined}
            onChange={(event) => { const value = key === 'parent_phone' ? formatMalaysianPhone(event.target.value) : event.target.value; setForm((current) => ({ ...current, [key]: value })); }}
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
        </label>)}
        <button disabled={busy || !form.full_name.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-40">{busy ? 'Registering…' : 'Register student'}</button>
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
