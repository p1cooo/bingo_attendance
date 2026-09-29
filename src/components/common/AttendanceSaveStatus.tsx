import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { attendanceSaves } from '../../lib/attendanceSaves.js';

export function useAttendanceSaves() {
  useSyncExternalStore(attendanceSaves.subscribe, attendanceSaves.getSnapshot);
  return attendanceSaves;
}

export function AttendanceSaveStatus() {
  const { pending, saved, failedNames } = useSyncExternalStore(attendanceSaves.subscribe, attendanceSaves.getSnapshot);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (pending) {
      setShowSuccess(false);
      return;
    }
    if (saved && failedNames.length === 0) {
      setShowSuccess(true);
      const timer = window.setTimeout(() => setShowSuccess(false), 3500);
      return () => window.clearTimeout(timer);
    }
  }, [pending, saved, failedNames.length]);

  if (!pending && !failedNames.length && !showSuccess) return null;
  return <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 z-[60] w-[min(94vw,28rem)] -translate-x-1/2 rounded-2xl border-2 border-slate-900 bg-white px-4 py-3 text-sm font-bold text-slate-900 shadow-[4px_4px_0_0_rgba(15,23,42,1)] dark:border-white dark:bg-neutral-900 dark:text-white">
    {pending > 0 && <div>Saving {pending} attendance change{pending === 1 ? '' : 's'}…</div>}
    {failedNames.length > 0 && <div className="mt-1 text-rose-700 dark:text-rose-300">
      {saved} attendance change{saved === 1 ? '' : 's'} saved. {failedNames.length} failed: {failedNames.join(', ')}
      <button type="button" className="ml-3 underline" onClick={() => attendanceSaves.retryFailed()}>Retry failed</button>
    </div>}
    {!pending && !failedNames.length && showSuccess && <div className="text-emerald-700 dark:text-emerald-300">All attendance changes saved ✓</div>}
  </div>;
}
