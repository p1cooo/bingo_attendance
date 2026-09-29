import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../server/db.js';
import { replacementCreditBalance } from '../server/replacementCredits.js';

test('positive and negative ledger balances carry across month boundaries', () => {
  const previous = db.replacementCredits;
  try {
    db.replacementCredits = new Map([
      ['sep-positive', { student_id: 'positive', amount: 2, effective_at: '2026-09-30' } as any],
      ['sep-negative', { student_id: 'negative', amount: -1, effective_at: '2026-09-30' } as any],
    ]);
    assert.equal(replacementCreditBalance('positive'), 2);
    assert.equal(replacementCreditBalance('negative'), -1);
    db.replacementCredits.set('oct-absence', { student_id: 'negative', amount: 1, effective_at: '2026-10-01' } as any);
    assert.equal(replacementCreditBalance('positive'), 2);
    assert.equal(replacementCreditBalance('negative'), 0);
  } finally { db.replacementCredits = previous; }
});
