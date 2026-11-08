import React, { useState } from 'react';
import { api, type ClassCreditReset } from '../../lib/api.js';
import type { AcademyClass } from '../../types.js';
import { Modal } from './Modal.js';
import { useToast } from './Toast.js';

/**
 * "Replacements: On / Off" for a group class. Off = absences earn no
 * replacement credit (school classes such as Selayang School), and credits the
 * class already gave are taken back. Used by coaches (own classes) and admins.
 */
export const ClassReplacementSwitch: React.FC<{ cls: AcademyClass; onChanged: () => void | Promise<void> }> = ({ cls, onChanged }) => {
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ClassCreditReset | null>(null);
  if (cls.class_type !== 'GROUP') return null;
  const allowed = cls.replacements_allowed !== false;

  const apply = async () => {
    setBusy(true);
    try {
      const response = await api.setClassReplacements(cls.id, !allowed);
      setConfirming(false);
      if (allowed) setResult(response);
      else showToast(`Replacements turned on for ${cls.name}`, 'success');
      await onChanged();
    } catch (error: any) { showToast(error.message || 'Could not change replacements', 'error'); }
    finally { setBusy(false); }
  };

  const flagged = result?.students.filter((student) => student.had_replacements || student.balance_after < 0) || [];
  return <>
    <button type="button" onClick={() => setConfirming(true)}
      className={`rounded-lg border px-3 py-2 text-xs font-black ${allowed ? 'border-slate-900 bg-white text-slate-900' : 'border-rose-600 bg-rose-50 text-rose-700'}`}>
      Replacements: {allowed ? 'On' : 'Off'}
    </button>

    <Modal isOpen={confirming} onClose={() => !busy && setConfirming(false)} title={allowed ? 'Turn off replacements?' : 'Turn on replacements?'}>
      <div className="space-y-3 text-sm">
        <p><b>{cls.name}</b></p>
        {allowed ? <>
          <p className="text-xs text-slate-600">Use this for school classes that never give replacements. From now on, an absence in this class gives <b>no replacement credit</b>.</p>
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">Credits this class already gave for absences will be <b>taken back</b>. Students' credits from other classes are not touched. Nothing is deleted; each change is recorded.</p>
        </> : <p className="text-xs text-slate-600">From now on, an absence in this class gives 1 replacement credit again. Credits taken back earlier are not restored.</p>}
        <button type="button" disabled={busy} onClick={apply} className={`rounded-lg px-4 py-2 text-xs font-black text-white disabled:opacity-40 ${allowed ? 'bg-rose-700' : 'bg-slate-900'}`}>
          {busy ? 'Saving…' : allowed ? 'Turn off replacements' : 'Turn on replacements'}
        </button>
      </div>
    </Modal>

    <Modal isOpen={Boolean(result)} onClose={() => setResult(null)} title="Replacements turned off">
      {result && <div className="space-y-3 text-sm">
        <p><b>{cls.name}</b>: {result.removed} credit{result.removed === 1 ? '' : 's'} taken back from {result.students.length} student{result.students.length === 1 ? '' : 's'}.</p>
        {result.failed > 0 && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800">{result.failed} could not be saved. Turn replacements off again to retry.</p>}
        {flagged.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="font-bold">Please tell the admin: these students have used replacement classes before, so their balance may need checking.</p>
          <ul className="mt-1 list-disc pl-4">{flagged.map((student) => <li key={student.student_id}>{student.full_name} ({student.student_code}): now {student.balance_after} credit{Math.abs(student.balance_after) === 1 ? '' : 's'}</li>)}</ul>
        </div>}
        {result.students.length > 0 && <details className="text-xs text-slate-600"><summary className="cursor-pointer font-bold">All changes</summary>
          <ul className="mt-1 list-disc pl-4">{result.students.map((student) => <li key={student.student_id}>{student.full_name}: −{student.removed}, now {student.balance_after}</li>)}</ul></details>}
      </div>}
    </Modal>
  </>;
};
