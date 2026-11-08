import React, { useState } from 'react';
import { api, type CreditImportInputRow, type CreditImportPreviewRow } from '../../lib/api.js';
import { Modal } from '../common/Modal.js';
import { useToast } from '../common/Toast.js';
import { parseCreditPaste } from '../../lib/creditPaste.js';

type Result = Awaited<ReturnType<typeof api.commitCreditImport>>;

export const ReplacementCreditImportModal: React.FC<{ isOpen: boolean; onClose: () => void; onDone: () => void | Promise<void> }> = ({ isOpen, onClose, onDone }) => {
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<CreditImportInputRow[]>([]);
  const [preview, setPreview] = useState<CreditImportPreviewRow[] | null>(null);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const reset = () => { setText(''); setRows([]); setPreview(null); setResult(null); setBatchId(crypto.randomUUID()); };
  const close = () => { if (!busy) { reset(); onClose(); } };

  const check = async () => {
    const parsed = parseCreditPaste(text);
    if (!parsed.length) { showToast('Paste at least one row', 'error'); return; }
    setBusy(true);
    try { const response = await api.previewCreditImport(parsed); setRows(parsed); setPreview(response.rows); setBatchId(crypto.randomUUID()); }
    catch (error: any) { showToast(error.message || 'Could not check the list', 'error'); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    setBusy(true);
    try { const response = await api.commitCreditImport(batchId, rows); setResult(response); await onDone(); }
    catch (error: any) { showToast(error.message || 'Import failed', 'error'); }
    finally { setBusy(false); }
  };

  const errors = preview?.filter((row) => row.errors.length).length || 0;
  const changes = preview?.filter((row) => !row.errors.length && row.change !== 0).length || 0;
  return <Modal isOpen={isOpen} onClose={close} title="Import Replacement Credits">
    {result ? <div className="space-y-3 text-sm">
      <p><b>{result.updated}</b> updated · {result.results.filter((r) => r.status === 'NO_CHANGE').length} already correct{result.failed ? <> · <b className="text-rose-700">{result.failed} failed</b></> : null}</p>
      {result.failed > 0 && <p className="text-xs text-rose-700">Press "Retry failed" to try the failed rows again. Rows already done will not be added twice.</p>}
      <div className="max-h-64 overflow-y-auto rounded-lg border text-xs">{result.results.map((r) => <p key={r.student_code} className={`border-b p-2 ${r.status === 'FAILED' ? 'bg-rose-50 text-rose-800' : ''}`}>{r.student_code} {r.full_name} — {r.status === 'NO_CHANGE' ? 'no change' : r.status === 'FAILED' ? 'failed' : `${r.change > 0 ? '+' : ''}${r.change}`} · now {r.balance}</p>)}</div>
      <div className="flex gap-2">
        {result.failed > 0 && <button type="button" disabled={busy} onClick={confirm} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Retry failed</button>}
        <button type="button" onClick={close} className="rounded-lg border-2 border-slate-900 px-4 py-2 text-xs font-black">Done</button>
      </div>
    </div> : !preview ? <div className="space-y-3 text-sm">
      <p className="text-xs text-slate-600">Paste from Excel or Google Sheets, one student per row: <b>STU ID</b>, <b>credits</b>, note (optional). Each student's balance will be <b>set to</b> that number. Students not in the list are not changed.</p>
      <p className="text-xs text-amber-800">Turn off replacements for school classes first, so those resets don't change these totals afterwards.</p>
      <textarea aria-label="Pasted credit rows" value={text} onChange={(event) => setText(event.target.value)} rows={8} placeholder={'STU-0152\t3\tCoach Wei Yuan\nSTU-0237\t0'} className="w-full rounded-lg border-2 border-slate-900 p-2 font-mono text-xs" />
      <button type="button" disabled={busy || !text.trim()} onClick={check} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-40">{busy ? 'Checking…' : 'Check list'}</button>
    </div> : <div className="space-y-3 text-sm">
      <p className="text-xs">{preview.length} rows · <b>{changes}</b> will change{errors ? <> · <b className="text-rose-700">{errors} with errors</b></> : null}</p>
      <div className="max-h-72 overflow-auto rounded-lg border">
        <table className="w-full text-left text-xs"><thead className="bg-slate-50"><tr><th className="p-2">STU ID</th><th className="p-2">Name</th><th className="p-2">Now</th><th className="p-2">Set to</th><th className="p-2">Change</th></tr></thead>
          <tbody>{preview.map((row) => <tr key={row.row} className={row.errors.length ? 'bg-rose-50 text-rose-800' : ''}>
            <td className="p-2">{row.student_code || '—'}</td>
            <td className="p-2">{row.full_name || '—'}{row.errors.length ? <span className="block font-bold">{row.errors.join('; ')}</span> : null}</td>
            <td className="p-2">{row.student_id ? row.current : '—'}</td><td className="p-2">{row.declared ?? '—'}</td>
            <td className="p-2 font-bold">{row.errors.length ? '—' : row.change === 0 ? 'no change' : `${row.change > 0 ? '+' : ''}${row.change}`}</td>
          </tr>)}</tbody></table>
      </div>
      {errors > 0 && <p className="text-xs text-rose-700">Fix the rows in red (or remove them) and check again. Nothing is saved until every row is OK.</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setPreview(null)} className="rounded-lg border-2 border-slate-900 px-4 py-2 text-xs font-black">Back to edit</button>
        <button type="button" disabled={busy || errors > 0} onClick={confirm} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-40">{busy ? 'Saving…' : `Confirm ${changes} change${changes === 1 ? '' : 's'}`}</button>
      </div>
    </div>}
  </Modal>;
};
