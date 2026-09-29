import React, { useState } from 'react';
import type { ClassSchedule, Coach } from '../../types.js';
import { filterClassPicker, MONDAY_FIRST_DAYS, type ClassPickerFilters } from '../../lib/classPicker.js';

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const emptyFilters: ClassPickerFilters = { search: '', day: null, type: '', coachId: '' };

export function ClassMembershipPicker({ schedules, coaches = [], selected, onChange, admin = false }: {
  schedules: ClassSchedule[]; coaches?: Coach[]; selected: string[]; onChange: (ids: string[]) => void; admin?: boolean;
}) {
  const [filters, setFilters] = useState<ClassPickerFilters>(emptyFilters);
  const visible = filterClassPicker(schedules, filters);
  const chip = (label: string, active: boolean, onClick: () => void) =>
    <button type="button" key={label} aria-pressed={active} onClick={onClick}
      className={`rounded-full border-2 border-slate-900 px-3 py-1.5 text-xs font-bold ${active ? 'bg-amber-300' : 'bg-white hover:bg-amber-50'}`}>{label}</button>;
  return <section className="space-y-3 border-t border-slate-200 pt-4">
    <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-black">Classes</h4><span className="text-xs font-bold">{selected.length} selected</span></div>
    <input aria-label="Search classes" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })}
      placeholder="Search class name" className="w-full rounded-xl border-2 border-slate-900 bg-white p-2.5 text-sm" />
    <div className="flex flex-wrap gap-1.5" aria-label="Class day filters">
      {MONDAY_FIRST_DAYS.map((day) => chip(dayNames[day], filters.day === day, () => setFilters({ ...filters, day: filters.day === day ? null : day })))}
    </div>
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Class type filters">
      {chip('Group', filters.type === 'GROUP', () => setFilters({ ...filters, type: filters.type === 'GROUP' ? '' : 'GROUP' }))}
      {chip('Individual', filters.type === 'INDIVIDUAL', () => setFilters({ ...filters, type: filters.type === 'INDIVIDUAL' ? '' : 'INDIVIDUAL' }))}
      {admin && <select aria-label="Coach filter" value={filters.coachId} onChange={(event) => setFilters({ ...filters, coachId: event.target.value })}
        className="rounded-xl border-2 border-slate-900 bg-white px-2 py-1.5 text-xs font-bold">
        <option value="">All coaches</option>{coaches.map((coach) => <option key={coach.id} value={coach.id}>Coach {coach.name}</option>)}
      </select>}
      {chip('Reset', false, () => setFilters(emptyFilters))}
    </div>
    <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border-2 border-slate-900 bg-slate-50 p-2" aria-label="Class memberships">
      {visible.map((schedule) => {
        const checked = selected.includes(schedule.id);
        return <label key={schedule.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm ${checked ? 'border-amber-500 bg-amber-100' : 'border-slate-200 bg-white'}`}>
          <input type="checkbox" checked={checked} onChange={() => onChange(checked ? selected.filter((id) => id !== schedule.id) : [...selected, schedule.id])}
            className="h-4 w-4 accent-amber-500" />
          <span className="min-w-0"><b>{schedule.class_item?.name || 'Class'}</b><span className="block text-xs text-slate-600">{dayNames[schedule.day_of_week]} · {schedule.start_time}–{schedule.end_time} · {schedule.class_item?.class_type === 'INDIVIDUAL' ? 'Individual' : 'Group'} · Coach {schedule.coach?.name || 'Unassigned'}</span></span>
        </label>;
      })}
      {!visible.length && <p className="p-3 text-xs text-slate-500">No classes match these filters.</p>}
    </div>
  </section>;
}
