import React, { useState, useRef, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Check,
  X,
} from 'lucide-react';
import { getTodayDateString, formatShortDate, formatFullDate } from '../../lib/dateUtils.js';

interface CustomDatePickerProps {
  value?: string; // 'YYYY-MM-DD'
  onChange?: (newDate: string) => void;
  selectedDate?: string; // fallback alias
  onSelectDate?: (newDate: string) => void; // fallback alias
  sessionDates?: string[]; // Optional array of 'YYYY-MM-DD' that have active sessions
  label?: string;
  buttonLabel?: string;
  className?: string;
  buttonClassName?: string;
  compact?: boolean;
}

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  onChange,
  selectedDate,
  onSelectDate,
  sessionDates = [],
  label,
  buttonLabel,
  className = '',
  buttonClassName = '',
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeValue = value || selectedDate || getTodayDateString();
  const handleDateChange = (date: string) => {
    if (onChange) onChange(date);
    if (onSelectDate) onSelectDate(date);
  };

  const todayStr = getTodayDateString();

  // Selected date parsed
  const selectedDateStr = activeValue || todayStr;
  const [valYear, valMonth, valDay] = selectedDateStr.split('-').map(Number);

  // Month currently viewed in the calendar
  const [viewYear, setViewYear] = useState<number>(valYear || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>((valMonth || (new Date().getMonth() + 1)) - 1); // 0-indexed

  // When value changes from outside, sync view month/year
  useEffect(() => {
    if (activeValue && activeValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m] = activeValue.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [activeValue]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const handleJumpToToday = () => {
    const [tY, tM] = todayStr.split('-').map(Number);
    setViewYear(tY);
    setViewMonth(tM - 1);
    handleDateChange(todayStr);
    setIsOpen(false);
  };

  const handleSelectDate = (dayNum: number, targetMonth: number, targetYear: number) => {
    const moStr = String(targetMonth + 1).padStart(2, '0');
    const dayStr = String(dayNum).padStart(2, '0');
    const newDateStr = `${targetYear}-${moStr}-${dayStr}`;
    handleDateChange(newDateStr);
    setIsOpen(false);
  };

  // Build grid of days
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun
  const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const calendarGrid = [];

  // Previous month trailing days
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
    const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
    const dateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    calendarGrid.push({
      day,
      month: prevM,
      year: prevY,
      dateStr,
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInCurrentMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarGrid.push({
      day: d,
      month: viewMonth,
      year: viewYear,
      dateStr,
      isCurrentMonth: true,
    });
  }

  // Next month leading days (fill up to multiple of 7)
  const remainingSlots = (7 - (calendarGrid.length % 7)) % 7;
  for (let d = 1; d <= remainingSlots; d++) {
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
    const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarGrid.push({
      day: d,
      month: nextM,
      year: nextY,
      dateStr,
      isCurrentMonth: false,
    });
  }

  const isCurrentSelectionToday = selectedDateStr === todayStr;

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 mb-1 tracking-wider">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        id="custom-date-picker-trigger"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-2.5 px-3 py-2 text-xs font-bold rounded-2xl border-2 border-slate-900 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-900 dark:text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.06)] hover:bg-slate-50 dark:hover:bg-neutral-800 transition-all cursor-pointer ${buttonClassName}`}
      >
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="font-extrabold tracking-tight">
            {compact ? formatShortDate(selectedDateStr) : formatFullDate(selectedDateStr)}
          </span>
        </div>
        {isCurrentSelectionToday && (
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
            Today
          </span>
        )}
      </button>

      {/* Calendar Popover */}
      {isOpen && (
        <div
          id="custom-date-picker-popover"
          className="absolute z-50 mt-2 w-80 p-4 rounded-3xl bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.1)] right-0 sm:left-0 sm:right-auto animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header Navigation */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-neutral-700 transition cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="text-center">
              <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider block">
                {monthNames[viewMonth]} {viewYear}
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-neutral-700 transition cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w, idx) => (
              <span
                key={w}
                className={`text-[10px] font-black uppercase ${
                  idx === 0 || idx === 6
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {w}
              </span>
            ))}
          </div>

          {/* Day Cells Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarGrid.map((item, idx) => {
              const isSelected = item.dateStr === selectedDateStr;
              const isToday = item.dateStr === todayStr;
              const hasSession = sessionDates.includes(item.dateStr);

              return (
                <button
                  key={`${item.dateStr}-${idx}`}
                  type="button"
                  onClick={() => handleSelectDate(item.day, item.month, item.year)}
                  className={`h-8 rounded-xl text-xs font-bold flex flex-col items-center justify-center relative transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] scale-105 z-10'
                      : isToday
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-black border border-indigo-400 dark:border-indigo-600'
                      : item.isCurrentMonth
                      ? 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-neutral-800'
                      : 'text-slate-300 dark:text-neutral-600 hover:bg-slate-50 dark:hover:bg-neutral-800/40'
                  }`}
                >
                  <span>{item.day}</span>
                  {/* Dot indicator for sessions or today */}
                  {hasSession && !isSelected && (
                    <span className="w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400 -mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer Shortcuts */}
          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-neutral-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleJumpToToday}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-black bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-indigo-600" />
              Jump to Today
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
