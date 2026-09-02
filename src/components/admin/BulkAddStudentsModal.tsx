import React, { useState, useRef } from 'react';
import { Modal } from '../common/Modal.js';
import { api } from '../../lib/api.js';
import { useToast } from '../common/Toast.js';
import { ClassSchedule, Student } from '../../types.js';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  RefreshCw,
  HelpCircle,
  FileText,
} from 'lucide-react';

interface ParsedStudentRow {
  rowNum: number;
  full_name: string;
  nick_name?: string;
  student_id?: string;
  school?: string;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
  parent_relation?: string;
  status: 'ACTIVE' | 'INACTIVE';
  isValid: boolean;
  isImported?: boolean;
  errors: string[];
  feedback: string;
}

interface BulkAddStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingStudents: Student[];
  availableSchedules?: ClassSchedule[];
}

export const BulkAddStudentsModal: React.FC<BulkAddStudentsModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingStudents,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedStudentRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    successCount: number;
    failedCount: number;
    message: string;
  } | null>(null);

  // Download CSV Template with Student Information ONLY (No Schedule IDs)
  const handleDownloadTemplate = () => {
    const csvContent = [
      'full_name,nickname,student_id,school,parent_name,parent_phone,parent_email,parent_relation,status',
      '"Lucas Vance","Luke","STU-0105","St. Patrick Academy","Sarah Vance","+65 9123 4567","sarah.vance@example.com","Mother","ACTIVE"',
      '"Chloe Tan","Chloe","STU-0106","Raffles Institution","David Tan","+65 9234 5678","david.tan@example.com","Father","ACTIVE"',
      '"Marcus Chen","Marcus","","Anglo-Chinese School","Linda Chen","+65 9345 6789","linda.chen@example.com","Mother","ACTIVE"',
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'chess_academy_students_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('✓ CSV template downloaded successfully', 'info');
  };

  // Helper to parse CSV lines with quoted string support
  const parseCSVLine = (text: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (inQuotes && text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  // Process uploaded CSV file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setImportSummary(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const lines = content
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length <= 1) {
        showToast('CSV file is empty or missing data rows.', 'error');
        return;
      }

      // Read header row
      const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));

      const colIdx = {
        fullName: headers.findIndex((h) => h.includes('fullname') || h === 'full_name' || h === 'name' || h === 'student_name'),
        nickName: headers.findIndex((h) => h.includes('nick') || h === 'nickname' || h.includes('preferred')),
        studentId: headers.findIndex((h) => h === 'student_id' || h === 'studentid' || h === 'id'),
        school: headers.findIndex((h) => h.includes('school')),
        guardianName: headers.findIndex((h) => h.includes('guardian') || h.includes('parent_name') || h === 'parent'),
        guardianPhone: headers.findIndex((h) => h.includes('phone') || h.includes('mobile') || h.includes('contact')),
        guardianEmail: headers.findIndex((h) => h.includes('email')),
        relation: headers.findIndex((h) => h.includes('relation')),
        status: headers.findIndex((h) => h.includes('status')),
      };

      const existingNamesSet = new Set(existingStudents.map((s) => s.full_name.toLowerCase().trim()));
      const existingIdsSet = new Set(existingStudents.map((s) => s.student_id?.toUpperCase().trim()).filter(Boolean));
      const seenNamesInFile = new Set<string>();
      const seenIdsInFile = new Set<string>();

      const rows: ParsedStudentRow[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const cells = parseCSVLine(line);
        const rowNum = i + 1; // 1-based CSV line number

        const fullName = colIdx.fullName >= 0 && cells[colIdx.fullName] ? cells[colIdx.fullName] : (colIdx.fullName === -1 ? cells[0] || '' : '');
        const nickName = colIdx.nickName >= 0 ? cells[colIdx.nickName] : undefined;
        const studentId = colIdx.studentId >= 0 && cells[colIdx.studentId] ? cells[colIdx.studentId].trim().toUpperCase() : undefined;
        const school = colIdx.school >= 0 ? cells[colIdx.school] : undefined;
        const guardianName = colIdx.guardianName >= 0 ? cells[colIdx.guardianName] : undefined;
        const guardianPhone = colIdx.guardianPhone >= 0 ? cells[colIdx.guardianPhone] : undefined;
        const guardianEmail = colIdx.guardianEmail >= 0 ? cells[colIdx.guardianEmail] : undefined;
        const parentRelation = colIdx.relation >= 0 ? cells[colIdx.relation] : 'Parent';
        const rawStatus = colIdx.status >= 0 && cells[colIdx.status] ? cells[colIdx.status].toUpperCase() : 'ACTIVE';

        const errors: string[] = [];

        // Validation Checks
        const cleanName = fullName.trim();
        if (!cleanName) {
          errors.push('Missing required field: Student Name');
        } else {
          const lowerName = cleanName.toLowerCase();
          if (seenNamesInFile.has(lowerName)) {
            errors.push('Duplicate student in uploaded file');
          } else {
            seenNamesInFile.add(lowerName);
          }

          if (existingNamesSet.has(lowerName)) {
            errors.push('Student already exists in academy database');
          }
        }

        // Student ID checks
        if (studentId) {
          if (seenIdsInFile.has(studentId)) {
            errors.push(`Duplicate Student ID (${studentId}) in uploaded file`);
          } else {
            seenIdsInFile.add(studentId);
          }

          if (existingIdsSet.has(studentId)) {
            errors.push(`Student ID already exists: ${studentId}`);
          }
        }

        // Email validation if provided
        if (guardianEmail && guardianEmail.trim()) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(guardianEmail.trim())) {
            errors.push('Invalid parent email format');
          }
        }

        const isValid = errors.length === 0;
        const feedback = isValid ? 'Ready to import' : errors.join('; ');

        rows.push({
          rowNum,
          full_name: cleanName,
          nick_name: nickName,
          student_id: studentId,
          school,
          parent_name: guardianName,
          parent_phone: guardianPhone,
          parent_email: guardianEmail,
          parent_relation: parentRelation || 'Parent',
          status: rawStatus === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
          isValid,
          errors,
          feedback,
        });
      }

      setParsedRows(rows);
    };

    reader.readAsText(file);
  };

  // Import all valid rows
  const handleImportValidStudents = async () => {
    const validRows = parsedRows.filter((r) => r.isValid && !r.isImported);
    if (validRows.length === 0) {
      showToast('No unimported valid student rows to process.', 'error');
      return;
    }

    try {
      setIsImporting(true);

      const payload = validRows.map((r) => ({
        full_name: r.full_name,
        nick_name: r.nick_name,
        student_id: r.student_id,
        school: r.school,
        parent_name: r.parent_name,
        parent_phone: r.parent_phone,
        parent_email: r.parent_email,
        parent_relation: r.parent_relation,
        status: r.status,
      }));

      const res = await api.bulkCreateStudents(payload);

      // Update rows state with final outcome
      setParsedRows((prev) =>
        prev.map((row) => {
          if (row.isValid) {
            return {
              ...row,
              isImported: true,
              feedback: 'Added successfully',
            };
          }
          return row;
        })
      );

      const successCount = res.importedCount ?? validRows.length;
      const failedCount = parsedRows.length - successCount;

      setImportSummary({
        successCount,
        failedCount,
        message: `Successfully Added: ${successCount}, Failed: ${failedCount}`,
      });

      showToast(`✓ ${successCount} student(s) added successfully!`, 'success');
      onSuccess();
    } catch (err: any) {
      showToast(err.message || 'Bulk student import failed', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  // Download Feedback CSV (Contains original columns + Feedback column)
  const handleDownloadFeedbackReport = () => {
    if (parsedRows.length === 0) {
      showToast('No rows to export.', 'info');
      return;
    }

    const headers = 'row_number,full_name,nickname,student_id,school,parent_name,parent_phone,parent_email,parent_relation,status,Feedback';
    const lines = parsedRows.map((r) => {
      return [
        r.rowNum,
        `"${(r.full_name || '').replace(/"/g, '""')}"`,
        `"${(r.nick_name || '').replace(/"/g, '""')}"`,
        `"${(r.student_id || '').replace(/"/g, '""')}"`,
        `"${(r.school || '').replace(/"/g, '""')}"`,
        `"${(r.parent_name || '').replace(/"/g, '""')}"`,
        `"${(r.parent_phone || '').replace(/"/g, '""')}"`,
        `"${(r.parent_email || '').replace(/"/g, '""')}"`,
        `"${(r.parent_relation || '').replace(/"/g, '""')}"`,
        `"${r.status}"`,
        `"${r.feedback.replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = [headers, ...lines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `student_import_feedback_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('✓ Feedback CSV downloaded successfully', 'info');
  };

  const handleReset = () => {
    setFileName('');
    setParsedRows([]);
    setImportSummary(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const errorCount = parsedRows.filter((r) => !r.isValid).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Add Students via CSV"
      size="xl"
    >
      <div className="space-y-5">
        {/* Instructions & Template Action */}
        <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border-2 border-indigo-200 dark:border-indigo-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
              Upload & Import Student Roster
            </h4>
            <p className="text-xs text-indigo-900 dark:text-indigo-300">
              Download the student template, fill in student records (schedule assignment is managed separately afterwards), and upload to validate.
            </p>
          </div>
          <button
            type="button"
            id="download-csv-template-btn"
            onClick={handleDownloadTemplate}
            className="px-3.5 py-2 rounded-xl text-xs font-black bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 text-slate-900 dark:text-white hover:bg-slate-50 transition shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.06)] flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4 text-indigo-600" />
            <span>Download CSV Template</span>
          </button>
        </div>

        {/* Upload Box if no file parsed */}
        {parsedRows.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-neutral-700 hover:border-indigo-500 rounded-3xl p-8 text-center cursor-pointer transition-all bg-slate-50/60 dark:bg-neutral-900/60 hover:bg-indigo-50/20"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 mx-auto flex items-center justify-center mb-3 border-2 border-slate-900 dark:border-neutral-700">
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              Click or drag a CSV file to upload
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Supports standard UTF-8 .csv files with headers
            </p>
          </div>
        ) : (
          /* Preview & Validation Results */
          <div className="space-y-4">
            {/* Summary Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-100 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700">
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-neutral-900 border border-slate-300 dark:border-neutral-700 text-xs font-black">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span className="truncate max-w-[160px]">{fileName}</span>
                  <span className="text-[10px] text-slate-400">({parsedRows.length} rows)</span>
                </div>

                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {validCount} ready to import
                </span>

                {errorCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {errorCount} need attention
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                >
                  Upload different file
                </button>
              </div>
            </div>

            {/* Post-Import Summary Result Banner */}
            {importSummary && (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border-2 border-emerald-500 text-emerald-900 dark:text-emerald-200 text-xs font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-black">Import Complete</div>
                    <div className="text-[11px] text-emerald-800 dark:text-emerald-300">
                      Successfully Added: <span className="font-black text-emerald-900 dark:text-emerald-100">{importSummary.successCount}</span>, Failed: <span className="font-black text-rose-700 dark:text-rose-300">{importSummary.failedCount}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadFeedbackReport}
                    className="px-3 py-1.5 bg-white dark:bg-neutral-900 border border-emerald-600 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Download Feedback CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-black hover:bg-emerald-700 transition cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* Preview Table */}
            <div className="border-2 border-slate-900 dark:border-neutral-700 rounded-2xl overflow-hidden shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 text-white dark:bg-neutral-800 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2.5 font-black uppercase text-[10px] w-12 text-center">Row</th>
                      <th className="px-3 py-2.5 font-black uppercase text-[10px]">Student Name</th>
                      <th className="px-3 py-2.5 font-black uppercase text-[10px]">Student ID</th>
                      <th className="px-3 py-2.5 font-black uppercase text-[10px]">Guardian & Contact</th>
                      <th className="px-3 py-2.5 font-black uppercase text-[10px]">School</th>
                      <th className="px-3 py-2.5 font-black uppercase text-[10px]">Status</th>
                      <th className="px-3 py-2.5 font-black uppercase text-[10px]">Feedback</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-neutral-800 bg-white dark:bg-neutral-900">
                    {parsedRows.map((row) => (
                      <tr
                        key={row.rowNum}
                        className={row.isValid ? 'hover:bg-slate-50 dark:hover:bg-neutral-800/50' : 'bg-rose-50/40 dark:bg-rose-950/20'}
                      >
                        <td className="px-3 py-2 font-mono font-bold text-center text-slate-500">
                          {row.rowNum}
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-900 dark:text-white">
                          <div>{row.full_name || <span className="text-rose-500 italic">Missing Name</span>}</div>
                          {row.nick_name && (
                            <span className="text-[10px] text-slate-400 font-normal">({row.nick_name})</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          {row.student_id || <span className="text-slate-400 italic text-[10px]">Auto-assign</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                          <div>{row.parent_name || '—'} {row.parent_phone && `(${row.parent_phone})`}</div>
                          {row.parent_email && <div className="text-[10px] text-slate-400">{row.parent_email}</div>}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                          {row.school || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              row.status === 'ACTIVE'
                                ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                                : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`text-[11px] font-semibold ${
                              row.isImported
                                ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                                : row.isValid
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {row.feedback}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t-2 border-slate-200 dark:border-neutral-800">
          <div>
            {parsedRows.length > 0 && (
              <button
                type="button"
                id="download-feedback-csv-btn"
                onClick={handleDownloadFeedbackReport}
                className="px-3.5 py-2 rounded-xl text-xs font-black bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-slate-200 border-2 border-slate-300 dark:border-neutral-700 hover:bg-slate-200 dark:hover:bg-neutral-700 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Download className="w-4 h-4 text-indigo-600" />
                <span>Download Feedback CSV ({parsedRows.length})</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
            >
              Cancel
            </button>

            {parsedRows.length > 0 && !importSummary && (
              <button
                type="button"
                id="import-valid-students-btn"
                onClick={handleImportValidStudents}
                disabled={validCount === 0 || isImporting}
                className="px-5 py-2.5 rounded-2xl text-xs font-black bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.1)] transition active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Import {validCount} Valid Student{validCount === 1 ? '' : 's'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
