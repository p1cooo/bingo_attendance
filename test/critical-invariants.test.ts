import assert from 'node:assert/strict';
import test from 'node:test';
import { academyMonth, academyToday } from '../server/academyDate.js';
import { isFormalStudentCode, nextUnusedStudentCode, normaliseStudentCode } from '../server/studentIds.js';

test('STU allocation reuses the lowest available formal number', () => {
  assert.equal(nextUnusedStudentCode(['STU-0001', 'STU-0003', 'stu-0100', 'legacy-9']), 'STU-0002');
  assert.equal(nextUnusedStudentCode(['STU-0001', 'STU-0002', 'STU-0003', 'STU-0005', 'STU-9999']), 'STU-0004');
  assert.equal(nextUnusedStudentCode(['STU-0001', 'STU-0002', 'STU-0003', 'STU-0004', 'STU-0005', 'STU-0006', 'STU-9999']), 'STU-0007');
  assert.equal(nextUnusedStudentCode(['STU-1']), 'STU-0002');
  assert.equal(normaliseStudentCode(' stu-0004 '), 'STU-0004');
  assert.equal(isFormalStudentCode('STU-0004'), true);
  assert.equal(isFormalStudentCode('UNREG-0004'), false);
});

test('academy dates use Malaysia calendar boundaries instead of UTC', () => {
  assert.equal(academyToday(new Date('2026-09-21T16:30:00.000Z')), '2026-09-22');
  assert.equal(academyMonth(new Date('2026-09-30T16:30:00.000Z')), '2026-10');
});
