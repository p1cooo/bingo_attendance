import type { CreditImportInputRow } from './api.js';

/** Paste rows copied from Excel / Google Sheets: STU ID, credits, note (tab or comma separated). */
export function parseCreditPaste(text: string): CreditImportInputRow[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    .map((line) => line.includes('\t') ? line.split('\t') : line.split(','))
    .map(([id = '', credits = '', ...note]) => ({ student_id: id.trim(), credits: credits.trim(), note: note.join(' ').trim() }))
    // Skip a header row such as "STU ID, Credits, Note".
    .filter((row, index) => !(index === 0 && !/^STU-/i.test(row.student_id) && !/^-?\d+$/.test(String(row.credits))));
}
