import React, { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { api } from '../../lib/api.js';
import { Modal } from '../common/Modal.js';
import { useToast } from '../common/Toast.js';

interface BulkAddClassesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ImportError = { row: number; class_name?: string; feedback: string };

const parseCsvLine = (line: string) => {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { values.push(value.trim()); value = ''; }
    else value += character;
  }
  values.push(value.trim());
  return values;
};

export const BulkAddClassesModal: React.FC<BulkAddClassesModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const reset = () => { setFileName(''); setRows([]); setErrors([]); setSummary(null); if (inputRef.current) inputRef.current.value = ''; };
  const handleClose = () => { reset(); onClose(); };

  const downloadTemplate = () => {
    const content = [
      'class_name,class_type,day,start_time,end_time,coach_name,room_location,student_ids,capacity',
      'Saturday 930-11am,GROUP,Saturday,09:30,11:00,Wei Yuan,Chess Hall A,STU-0140;STU-0141,12',
      'Baxton Individual,INDIVIDUAL,Sunday,12:00,13:00,Wei Yuan,Online,STU-0138,1',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'bingo_chess_classes_template.csv'; link.click(); URL.revokeObjectURL(url);
    showToast('Class import template downloaded', 'success');
  };

  const readFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) { showToast('The CSV needs a header row and at least one class row.', 'error'); return; }
      const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/[^a-z0-9_]/g, ''));
      const parsed = lines.slice(1).map((line) => {
        const cells = parseCsvLine(line);
        return Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
      });
      setRows(parsed); setFileName(file.name); setErrors([]); setSummary(null);
    };
    reader.readAsText(file);
  };

  const importClasses = async () => {
    if (!rows.length) { showToast('Upload a class CSV first.', 'error'); return; }
    setIsImporting(true); setErrors([]); setSummary(null);
    try {
      const response = await api.bulkCreateClasses(rows);
      setErrors(response.errors || []);
      setSummary(`${response.importedCount} class${response.importedCount === 1 ? '' : 'es'} added${response.errorCount ? `; ${response.errorCount} row${response.errorCount === 1 ? '' : 's'} need attention.` : '.'}`);
      if (response.importedCount) { showToast(`${response.importedCount} classes added to the timetable`, 'success'); onSuccess(); }
    } catch (error: any) {
      showToast(error.message || 'Class import failed', 'error');
    } finally { setIsImporting(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Bulk Add Classes" size="lg">
      <div className="space-y-4">
        <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-4 text-xs text-indigo-950 dark:text-indigo-100">
          <p className="font-black">One row creates the recurring class, its weekly timetable entry, and optional student enrolments.</p>
          <p className="mt-1 text-indigo-800 dark:text-indigo-200">Use the exact coach name and student IDs. Separate several student IDs with semicolons. Leave student_ids blank if you will set the roster later.</p>
        </div>

        <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-200 dark:border-neutral-700 px-3.5 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-neutral-800 cursor-pointer">
          <Download className="h-4 w-4" /> Download CSV Template
        </button>

        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => readFile(event.target.files?.[0])} />
        <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 dark:border-neutral-700 px-4 py-8 text-sm font-bold text-slate-700 dark:text-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 cursor-pointer">
          <Upload className="h-5 w-5" /> {fileName ? fileName : 'Choose a class CSV file'}
        </button>

        {rows.length > 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-neutral-700 overflow-hidden">
            <div className="flex items-center justify-between bg-slate-50 dark:bg-neutral-800 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200">
              <span className="inline-flex items-center gap-1.5"><FileSpreadsheet className="h-4 w-4 text-indigo-600" /> {rows.length} class row{rows.length === 1 ? '' : 's'} ready to validate</span>
              <button type="button" onClick={reset} disabled={isImporting} className="text-slate-500 hover:text-rose-600 cursor-pointer">Clear</button>
            </div>
            <div className="max-h-44 overflow-auto text-xs">
              {rows.slice(0, 10).map((row, index) => <div key={index} className="grid grid-cols-4 gap-2 border-t border-slate-100 dark:border-neutral-800 px-3.5 py-2 text-slate-700 dark:text-slate-300"><span className="font-mono text-slate-400">#{index + 1}</span><span className="font-bold truncate">{row.class_name || row.name || 'Untitled'}</span><span>{row.day || row.day_of_week || '—'} {row.start_time || ''}</span><span>{row.coach_name || row.coach || '—'}</span></div>)}
              {rows.length > 10 && <div className="px-3.5 py-2 text-slate-500">…and {rows.length - 10} more rows</div>}
            </div>
          </div>
        )}

        {summary && <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-xs font-bold text-emerald-800 dark:text-emerald-200">{summary}</div>}
        {errors.length > 0 && <div className="max-h-32 overflow-auto rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-800 dark:text-rose-200 space-y-1">{errors.map((error, index) => <p key={index}><b>Row {error.row}</b>{error.class_name ? ` (${error.class_name})` : ''}: {error.feedback}</p>)}</div>}

        <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-neutral-800 pt-3">
          <button type="button" onClick={handleClose} disabled={isImporting} className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">Cancel</button>
          <button type="button" onClick={importClasses} disabled={!rows.length || isImporting} className="rounded-xl bg-slate-900 dark:bg-white px-5 py-2.5 text-xs font-black text-white dark:text-slate-900 disabled:opacity-50 cursor-pointer">{isImporting ? 'Importing…' : `Import ${rows.length || ''} Classes`}</button>
        </div>
      </div>
    </Modal>
  );
};
