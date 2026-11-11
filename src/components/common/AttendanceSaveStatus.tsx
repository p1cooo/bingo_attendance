import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { attendanceSaves } from '../../lib/attendanceSaves.js';

const SUCCESS_VISIBLE_MS = 3500;
const FAILURE_VISIBLE_MS = 5000;

export function useAttendanceSaves() {
  useSyncExternalStore(attendanceSaves.subscribe, attendanceSaves.getSnapshot);
  return attendanceSaves;
}

export function AttendanceSaveStatus() {
  const { pending, saved, failures } = useSyncExternalStore(attendanceSaves.subscribe, attendanceSaves.getSnapshot);
  const [showSuccess, setShowSuccess] = useState(false);
  // Restart the hide timer whenever the set of failures changes (e.g. a retry fails again).
  const failureKey = failures.map((failure) => `${failure.name}:${failure.reason}`).join('|');

  useEffect(() => {
    if (pending) {
      setShowSuccess(false);
      return;
    }
    if (saved && failures.length === 0) {
      setShowSuccess(true);
      const timer = window.setTimeout(() => setShowSuccess(false), SUCCESS_VISIBLE_MS);
      return () => window.clearTimeout(timer);
    }
  }, [pending, saved, failures.length]);

  useEffect(() => {
    if (pending || !failureKey) return;
    const timer = window.setTimeout(() => attendanceSaves.dismissFailed(), FAILURE_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [pending, failureKey]);

  if (!pending && !failures.length && !showSuccess) return null;
  return <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 z-[60] w-[min(94vw,28rem)] -translate-x-1/2 rounded-2xl border-2 border-slate-900 bg-white px-4 py-3 text-sm font-bold text-slate-900 shadow-[4px_4px_0_0_rgba(15,23,42,1)] dark:border-white dark:bg-neutral-900 dark:text-white">
    {pending > 0 && <div>Saving {pending} attendance change{pending === 1 ? '' : 's'}…</div>}
    {failures.length > 0 && <div className="mt-1 text-rose-700 dark:text-rose-300">
      <div>{saved} attendance change{saved === 1 ? '' : 's'} saved. {failures.length} not saved:</div>
      <ul className="mt-1 list-disc pl-5 font-semibold">
        {failures.map((failure) => <li key={`${failure.name}:${failure.reason}`}>{failure.name}: {failure.reason}</li>)}
      </ul>
      <div className="mt-2 flex gap-4">
        <button type="button" className="underline" onClick={() => attendanceSaves.retryFailed()}>Retry failed</button>
        <button type="button" className="underline text-slate-600 dark:text-slate-300" onClick={() => attendanceSaves.dismissFailed()}>Close</button>
      </div>
    </div>}
    {!pending && !failures.length && showSuccess && <div className="text-emerald-700 dark:text-emerald-300">All attendance changes saved ✓</div>}
  </div>;
}
