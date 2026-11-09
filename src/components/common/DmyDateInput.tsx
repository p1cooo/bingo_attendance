import React, { useEffect, useId, useState } from 'react';
import { checkDmy, formatDmy, isoDaysBefore, longDateLabel } from '../../lib/dmyDate.js';
import { CustomDatePicker } from './CustomDatePicker.js';

interface DmyDateInputProps {
  label: string;
  /** ISO YYYY-MM-DD, or '' while the typed text is not a valid date. */
  value: string;
  onChange: (iso: string) => void;
  /** Today's date in ISO, used by the Today / Yesterday buttons. */
  today: string;
  /** Latest allowed ISO date (e.g. today for payments). */
  max?: string;
  hint?: string;
  className?: string;
}

/** Always day-first, whatever the computer's language setting. Type it, or pick from the calendar button. */
export const DmyDateInput: React.FC<DmyDateInputProps> = ({ label, value, onChange, today, max, hint, className = '' }) => {
  const inputId = useId();
  const [text, setText] = useState(formatDmy(value));
  useEffect(() => { if (value && checkDmy(text, max).iso !== value) setText(formatDmy(value)); }, [value]);
  const check = checkDmy(text, max);
  const update = (next: string) => { setText(next); onChange(checkDmy(next, max).iso || ''); };
  const pick = (iso: string) => update(formatDmy(iso));
  const quick = 'rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-neutral-700 dark:text-slate-300 dark:hover:bg-neutral-800';
  return <div>
    <label className="block text-sm font-bold" htmlFor={inputId}>{label}</label>
    <div className="relative">
      <input id={inputId} className={`${className} pr-11`} required inputMode="numeric" autoComplete="off" placeholder="dd/mm/yyyy" aria-invalid={Boolean(check.error)}
        value={text} onChange={e => update(e.target.value)} />
      <div className="absolute inset-y-0 right-1.5 flex items-center">
        <CustomDatePicker iconOnly popoverAlign="right" maxDate={max} value={check.iso || value || today} onChange={pick} />
      </div>
    </div>
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <button type="button" className={quick} onClick={() => pick(today)}>Today</button>
      <button type="button" className={quick} onClick={() => pick(isoDaysBefore(today, 1))}>Yesterday</button>
      {check.iso
        ? <span role="status" className="text-xs font-bold text-emerald-700 dark:text-emerald-300">= {longDateLabel(check.iso)}</span>
        : text.trim() ? <span role="alert" className="text-xs font-bold text-rose-600">{check.error}</span>
          : <span className="text-xs text-slate-500">Day / month / year</span>}
    </div>
    {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
  </div>;
};
