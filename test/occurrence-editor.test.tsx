import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OccurrenceEditor } from '../src/components/common/OccurrenceEditor.js';
import { ToastProvider } from '../src/components/common/Toast.js';
import type { ClassSession, Coach } from '../src/types.js';

const session = { id: 'session-1', class_id: 'class-1', schedule_id: 'class-1', session_date: '2026-10-11',
  start_time: '09:00', end_time: '10:30', scheduled_coach_id: 'coach-1', actual_coach_id: 'coach-1',
  status: 'SCHEDULED', class_item: { name: 'Chess' }, default_coach: { name: 'One' } } as ClassSession;
const coaches = [
  { id: 'coach-1', name: 'One', is_active: true },
  { id: 'coach-2', name: 'Two', is_active: true },
  { id: 'coach-3', name: 'Inactive', is_active: false },
] as Coach[];

test('shared occurrence editor renders all modes and editing fields', () => {
  const html = renderToStaticMarkup(<ToastProvider><OccurrenceEditor session={session} coaches={coaches}
    onClose={() => {}} onSaved={() => {}} /></ToastProvider>);
  for (const label of ['Normal Session', 'Replacement Coach', 'Coach Cancelled', 'Planned Off-Day',
    'New date', 'Start time', 'End time', 'Change Notes', 'Save Changes', '5th week']) {
    assert.ok(html.includes(label), `missing ${label}`);
  }
  assert.equal((html.match(/name="session_type"/g) || []).length, 4);
  assert.ok(html.includes('max-w-lg'));
});

test('replacement selector includes only eligible coaches', () => {
  const html = renderToStaticMarkup(<ToastProvider><OccurrenceEditor session={{ ...session,
    session_type: 'REPLACEMENT_COACH', replacement_coach_id: 'coach-2', actual_coach_id: 'coach-2' }}
    coaches={coaches} onClose={() => {}} onSaved={() => {}} /></ToastProvider>);
  assert.ok(html.includes('value="coach-2"'));
  assert.equal(html.includes('value="coach-1"'), false);
  assert.equal(html.includes('value="coach-3"'), false);
});

test('cancelled and fifth-week off-day modes retain their reason and notes', () => {
  for (const mode of ['COACH_CANCELLED', 'PLANNED_OFF_DAY'] as const) {
    const html = renderToStaticMarkup(<ToastProvider><OccurrenceEditor session={{ ...session,
      status: mode, session_type: mode, cancellation_reason: '5th week', notes: 'Families informed' }}
      coaches={coaches} onClose={() => {}} onSaved={() => {}} /></ToastProvider>);
    assert.ok(html.includes('value="5th week"'));
    assert.ok(html.includes('Families informed'));
  }
});

test('after attendance, scheduling controls lock while shared notes remain editable', () => {
  const html = renderToStaticMarkup(<ToastProvider><OccurrenceEditor session={{ ...session,
    marked_attendance_count: 1, notes: 'Follow-up note' }} coaches={coaches}
    onClose={() => {}} onSaved={() => {}} /></ToastProvider>);
  assert.ok(html.includes('Attendance has been taken'));
  assert.ok(html.includes('Follow-up note'));
  assert.ok(html.includes('Save Changes'));
  assert.ok((html.match(/disabled=""/g) || []).length >= 7);
  assert.equal(/<textarea[^>]*disabled/.test(html), false);
});
