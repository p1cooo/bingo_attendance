import assert from 'node:assert/strict';
import test from 'node:test';
import { commitOccurrence } from '../server/occurrencePersistence.js';
import type { ActivityLog, ClassSession } from '../src/types.js';
import type { Firestore } from 'firebase-admin/firestore';

test('two saves from the same occurrence revision cannot both commit', async () => {
  const documents = new Map<string, Record<string, unknown>>([
    ['sessions/occurrence-1', { id: 'occurrence-1', status: 'SCHEDULED' }],
  ]);
  let pending = Promise.resolve();
  const fakeFirestore = {
    collection(name: string) { return { doc(id: string) { return { path: `${name}/${id}` }; },
      where(_field: string, _operator: string, id: string) { return { query: { name, id } }; } }; },
    runTransaction<T>(callback: (transaction: any) => Promise<T>): Promise<T> {
      const execute = async () => {
        const writes: Array<() => void> = [];
        const transaction = {
          async get(ref: { path?: string; query?: { name: string; id: string } }) {
            if (ref.query) return { docs: [...documents.entries()]
              .filter(([path, value]) => path.startsWith(`${ref.query!.name}/`) && value.session_id === ref.query!.id)
              .map(([, value]) => ({ data: () => value })) };
            const value = documents.get(ref.path!);
            return { exists: Boolean(value), data: () => value }; },
          set(ref: { path: string }, value: Record<string, unknown>, options?: { merge: boolean }) {
            writes.push(() => documents.set(ref.path, options?.merge
              ? { ...documents.get(ref.path), ...value } : value));
          },
        };
        const result = await callback(transaction);
        writes.forEach((write) => write());
        return result;
      };
      const result = pending.then(execute);
      pending = result.then(() => undefined, () => undefined);
      return result;
    },
  } as unknown as Firestore;
  const occurrence = { id: 'occurrence-1', class_id: 'class-1', session_date: '2026-10-11',
    start_time: '09:00', end_time: '10:30', status: 'SCHEDULED' } as ClassSession;
  const activity = (id: string) => ({ id, actor_user_id: 'coach-1', actor_user_name: 'Coach One',
    actor_role: 'COACH', action: 'OCCURRENCE_TIME_CHANGED', entity_type: 'session',
    entity_id: occurrence.id, created_at: '2026-10-11T00:00:00Z' }) as ActivityLog;
  const [first, second] = await Promise.all([
    commitOccurrence(fakeFirestore, occurrence, activity('audit-1'), null, true),
    commitOccurrence(fakeFirestore, occurrence, activity('audit-2'), null, true),
  ]);
  assert.equal(first.kind, 'saved');
  assert.equal(second.kind, 'stale');
  assert.equal(documents.has('activityLogs/audit-1'), true);
  assert.equal(documents.has('activityLogs/audit-2'), false);
  const firstRevision = first.kind === 'saved' ? first.session.occurrence_revision! : '';
  assert.equal(documents.get('sessions/occurrence-1')?.occurrence_revision, firstRevision);
  const third = await commitOccurrence(fakeFirestore, { ...occurrence, start_time: '12:00' },
    activity('audit-3'), firstRevision, true);
  assert.equal(third.kind, 'saved');
  assert.notEqual(third.kind === 'saved' ? third.session.occurrence_revision : '', firstRevision);
  documents.set('attendance/mark-1', { session_id: occurrence.id, status: 'PRESENT' });
  const currentRevision = third.kind === 'saved' ? third.session.occurrence_revision! : '';
  const blocked = await commitOccurrence(fakeFirestore, { ...occurrence, start_time: '13:00' },
    activity('audit-4'), currentRevision, true);
  assert.equal(blocked.kind, 'marked');
  assert.equal(documents.has('activityLogs/audit-4'), false);
});
