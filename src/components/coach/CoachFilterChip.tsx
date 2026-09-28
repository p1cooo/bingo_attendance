import React from 'react';

export const CoachFilterChip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => <button
  type="button"
  aria-pressed={active}
  onClick={onClick}
  className={`shrink-0 whitespace-nowrap rounded-full border-2 border-slate-900 px-3 py-1.5 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${active ? 'bg-sky-200 text-slate-950 shadow-[2px_2px_0_#0f172a]' : 'bg-white text-slate-700 hover:bg-sky-50'}`}
>{label}</button>;
