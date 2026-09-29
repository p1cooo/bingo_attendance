import React, { useState } from 'react';
import type { ClassSchedule, Coach } from '../../types.js';
import { filterClassPicker, MONDAY_FIRST_DAYS, toggleClassDay, type ClassPickerFilters } from '../../lib/classPicker.js';

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const emptyFilters: ClassPickerFilters = { search: '', days: [], type: '', coachId: '' };

export function ClassMembershipPicker({ schedules, coaches = [], selected, onChange, admin = false }: {
  schedules: ClassSchedule[]; coaches?: Coach[]; selected: string[]; onChange: (ids: string[]) => void; admin?: boolean;
}) {
  const [filters, setFilters] = useState<ClassPickerFilters>(emptyFilters);
  const visible = filterClassPicker(schedules, filters);
  const dayLabel = filters.days.length === 0 ? 'All' : filters.days.length <= 2
    ? MONDAY_FIRST_DAYS.filter((day) => filters.days.includes(day)).map((day) => dayNames[day]).join(', ')
    : `${filters.days.length} days selected`;
  return <section className="space-y-3 border-t border-slate-200 pt-4">
    <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-black">Classes</h4><span className="text-xs font-bold">{selected.length} selected</span></div>
    <input aria-label="Search classes" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })}
      placeholder="Search class name" className="w-full rounded-xl border-2 border-slate-900 bg-white p-2.5 text-sm" />
    <div className="flex flex-wrap items-start gap-2">
      <details className="group relative" aria-label="Class day filters">
        <summary className="cursor-pointer list-none rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-xs font-bold hover:bg-amber-50">Day: {dayLabel} <span aria-hidden="true">▾</span></summary>
        <div className="absolute left-0 z-20 mt-1 max-h-64 min-w-44 overflow-y-auto rounded-xl border-2 border-slate-900 bg-white p-2 shadow-lg">
          {MONDAY_FIRST_DAYS.map((day) => <label key={day} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold hover:bg-amber-50">
            <input type="checkbox" checked={filters.days.includes(day)} onChange={() => setFilters((current) => ({ ...current, days: toggleClassDay(current.days, day) }))} className="h-4 w-4 accent-amber-500" />{dayNames[day]}
          </label>)}
        </div>
      </details>
      <details className="group relative" aria-label="Class type filters">
        <summary className="cursor-pointer list-none rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-xs font-bold hover:bg-amber-50">Type: {filters.type === 'INDIVIDUAL' ? 'Individual' : filters.type === 'GROUP' ? 'Group' : 'All'} <span aria-hidden="true">▾</span></summary>
        <div className="absolute left-0 z-20 mt-1 min-w-36 rounded-xl border-2 border-slate-900 bg-white p-2 shadow-lg">
          {([['', 'All'], ['GROUP', 'Group'], ['INDIVIDUAL', 'Individual']] as const).map(([value, label]) => <label key={label} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold hover:bg-amber-50">
            <input type="radio" name="class-picker-type" checked={filters.type === value} onChange={() => setFilters((current) => ({ ...current, type: value }))} className="h-4 w-4 accent-amber-500" />{label}
          </label>)}
        </div>
      </details>
      {admin && <select aria-label="Coach filter" value={filters.coachId} onChange={(event) => setFilters({ ...filters, coachId: event.target.value })}
        className="rounded-xl border-2 border-slate-900 bg-white px-2 py-1.5 text-xs font-bold">
        <option value="">All coaches</option>{coaches.map((coach) => <option key={coach.id} value={coach.id}>Coach {coach.name}</option>)}
      </select>}
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
