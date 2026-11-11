import type { AttendanceRecord, ClassSession } from '../types.js';
import { withAttendanceRecord } from './attendanceMark.js';

type SaveResult = { attendance_record: AttendanceRecord };
type Mark = {
  sessionId: string;
  studentId: string;
  studentName: string;
  optimisticRecord: AttendanceRecord;
  save: () => Promise<SaveResult>;
};

export type AttendanceSaveSnapshot = {
  pending: number;
  saved: number;
  failedNames: string[];
  failures: AttendanceSaveFailure[];
};

export type AttendanceSaveFailure = { name: string; reason: string };
type FailedMark = Mark & { reason: string };

const FALLBACK_FAILURE_REASON = 'Could not save. Please try again.';

/** The server sends a plain reason (e.g. "Roll call is closed"); keep it so the coach knows what to do. */
export const saveFailureReason = (error: unknown): string =>
  error instanceof Error && error.message.trim() ? error.message.trim() : FALLBACK_FAILURE_REASON;

export const shouldWarnOnUnload = (snapshot: AttendanceSaveSnapshot) => snapshot.pending > 0;

/** Lives outside roll-call components, so navigating in the app cannot cancel a write. */
export class AttendanceSaves {
  private pending = new Map<string, Mark>();
  private failed = new Map<string, FailedMark>();
  private records = new Map<string, AttendanceRecord>();
  private listeners = new Set<() => void>();
  private saved = 0;
  private warningAttached = false;
  private snapshot: AttendanceSaveSnapshot = { pending: 0, saved: 0, failedNames: [], failures: [] };
  private warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.snapshot;

  private key(sessionId: string, studentId: string) { return `${sessionId}:${studentId}`; }
  private changed() {
    const failed = [...this.failed.values()];
    this.snapshot = {
      pending: this.pending.size,
      saved: this.saved,
      failedNames: failed.map((mark) => mark.studentName),
      failures: failed.map((mark) => ({ name: mark.studentName, reason: mark.reason })),
    };
    if (typeof window !== 'undefined') {
      if (shouldWarnOnUnload(this.snapshot) && !this.warningAttached) {
        window.addEventListener('beforeunload', this.warnBeforeUnload);
        this.warningAttached = true;
      } else if (this.snapshot.pending === 0 && this.warningAttached) {
        window.removeEventListener('beforeunload', this.warnBeforeUnload);
        this.warningAttached = false;
      }
    }
    this.listeners.forEach((listener) => listener());
  }

  isPending(sessionId: string, studentId: string) {
    return this.pending.has(this.key(sessionId, studentId));
  }

  overlay<T extends ClassSession>(session: T): T {
    let result = session;
    for (const [key, record] of this.records) {
      if (!key.startsWith(`${session.id}:`)) continue;
      const fromServer = session.attendance_records?.find((item) => item.student_id === record.student_id);
      if (!this.pending.has(key) && fromServer?.id === record.id && fromServer.marked_at >= record.marked_at) {
        this.records.delete(key);
        continue;
      }
      result = withAttendanceRecord(result, record.student_id, record);
    }
    return result;
  }

  submit(mark: Mark): boolean {
    const key = this.key(mark.sessionId, mark.studentId);
    if (this.pending.has(key)) return false;
    if (this.pending.size === 0 && this.failed.size === 0) this.saved = 0;
    this.failed.delete(key);
    this.pending.set(key, mark);
    this.records.set(key, mark.optimisticRecord);
    this.changed();
    void mark.save().then(({ attendance_record }) => {
      this.records.set(key, { ...attendance_record, student: attendance_record.student || mark.optimisticRecord.student });
      this.saved++;
    }).catch((error: unknown) => {
      this.records.delete(key);
      this.failed.set(key, { ...mark, reason: saveFailureReason(error) });
    }).finally(() => {
      this.pending.delete(key);
      this.changed();
    });
    return true;
  }

  retryFailed() {
    for (const { reason: _reason, ...mark } of [...this.failed.values()]) this.submit(mark);
  }

  /** Hide failed marks from the status bar. The row is already back to unmarked, so the coach can tap it again. */
  dismissFailed() {
    if (this.failed.size === 0) return;
    this.failed.clear();
    this.changed();
  }
}

export const attendanceSaves = new AttendanceSaves();
