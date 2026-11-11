import React from 'react';
import { getTodayDateString } from '../../lib/dateUtils.js';
import { earliestClassStartDate } from '../../lib/classStartDate.js';

interface ClassStartDateFieldProps {
  value: string;
  onChange: (date: string) => void;
  /** Scheduled adds from roll call may start in the future. */
  allowFuture?: boolean;
  label?: string;
}

/** The first lesson the student attends in the class. Earlier lesson sheets will not list them. */
export function ClassStartDateField({ value, onChange, allowFuture = false, label = 'Class start date' }: ClassStartDateFieldProps) {
  const today = getTodayDateString();
  return <label className="block text-xs font-bold">{label}
    <input type="date" required value={value} min={earliestClassStartDate(today)} max={allowFuture ? undefined : today}
      onChange={(event) => onChange(event.target.value)}
      className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800" />
    <span className="mt-1 block font-normal text-slate-500">The first lesson they attended. Roll call before this date will not list them, so pick an earlier date if they already came to class.</span>
  </label>;
}
