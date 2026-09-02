import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../common/Toast.js';
import { getCurrentMonthString } from '../../lib/dateUtils.js';
import {
  Coach,
  AcademyClass,
  ClassSession,
  MonthlyReportItem,
  MonthlyStudentReportItem,
  AttendanceRecord,
  AttendanceAuditLog,
} from '../../types.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';
import { Modal } from '../common/Modal.js';
import { CoachReportDetailView } from './CoachReportDetailView.js';
import {
  FileText,
  Download,
  Printer,
  Calendar,
  Users,
  Award,
  TrendingUp,
  UserCheck,
  Sparkles,
  ChevronRight,
  Clock,
  MapPin,
  FileSpreadsheet,
  History,
  Search,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

interface ReportResponse {
  month: string;
  coaches_summary: MonthlyReportItem[];
  students_summary: MonthlyStudentReportItem[];
}

export const MonthlyReportsView: React.FC = () => {
  const { showToast } = useToast();

  const [reportData, setReportData] = useState<ReportResponse | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [classes, setClasses] = useState<AcademyClass[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [month, setMonth] = useState(getCurrentMonthString());
  const [coachId, setCoachId] = useState('');
  const [classId, setClassId] = useState('');
  const [reportTab, setReportTab] = useState<'COACH' | 'STUDENT' | 'LOGS'>('COACH');

  // Dedicated Full Page Coach Report State
  const [inspectingCoachId, setInspectingCoachId] = useState<string | null>(null);

  // Student Drilldown modal state
  const [drilldownStudent, setDrilldownStudent] = useState<MonthlyStudentReportItem | null>(null);

  // Historical Attendance Records & Audit Trail State
  const [attendanceRecords, setAttendanceRecords] = useState<(AttendanceRecord & { session?: ClassSession })[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordSearch, setRecordSearch] = useState('');
  const [recordStatus, setRecordStatus] = useState('');
  const [allAuditLogs, setAllAuditLogs] = useState<AttendanceAuditLog[]>([]);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const loadReport = async () => {
    try {
      setLoading(true);
      const [data, coachList, classList] = await Promise.all([
        api.getMonthlyReport({ month, coach_id: coachId, class_id: classId }),
        api.getCoaches(),
        api.getClasses(),
      ]);
      setReportData(data);
      setCoaches(coachList);
      setClasses(classList);
    } catch (err: any) {
      showToast(err.message || 'Failed to load report', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAttendanceRecords = async () => {
    try {
      setLoadingRecords(true);
      const data = await api.getAttendanceRecords({
        month,
        coach_id: coachId || undefined,
        class_id: classId || undefined,
        status: recordStatus || undefined,
        student_search: recordSearch || undefined,
      });
      setAttendanceRecords(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to load historical attendance records', 'error');
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [month, coachId, classId]);

  useEffect(() => {
    if (reportTab === 'LOGS') {
      loadAttendanceRecords();
    }
  }, [reportTab, month, coachId, classId, recordStatus, recordSearch]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';

    if (reportTab === 'COACH') {
      if (!reportData) return;
      csvContent +=
        'Coach Name,Total Sessions,Group Sessions,Individual Sessions,Replacement Sessions,Student Attendances\n';
      reportData.coaches_summary.forEach((c) => {
        csvContent += `"${c.coach_name}",${c.total_sessions_taught},${c.group_sessions_count},${c.individual_sessions_count},${c.replacement_sessions_taught},${c.total_student_attendances}\n`;
      });
    } else if (reportTab === 'STUDENT') {
      if (!reportData) return;
      csvContent +=
        'Student Name,Student ID,Total Scheduled,Present,Absent,Replacements,Attendance Rate\n';
      reportData.students_summary.forEach((s) => {
        csvContent += `"${s.student_name}","${s.student_code}",${s.total_scheduled},${s.attended_count},${s.absent_count},${s.replacement_count},${s.attendance_rate}%\n`;
      });
    } else {
      // Historical Logs CSV
      csvContent +=
        'Date,Time,Class,Venue,Student Name,Student ID,Coach,Attendance Type,Status,Audit Reason\n';
      attendanceRecords.forEach((r) => {
        const studentName = r.student?.full_name || r.unregistered_student_name || 'Student';
        const studentId = r.student?.student_id || 'TRIAL';
        const className = r.session?.class_item?.name || 'Class';
        const venue = r.session?.room_location || r.session?.class_item?.room_location || 'Main Hall';
        const coachName = r.session?.teaching_coach?.name || r.session?.actual_coach?.name || 'Coach';
        csvContent += `"${r.session?.session_date || ''}","${r.session?.start_time || ''}","${className}","${venue}","${studentName}","${studentId}","${coachName}","${r.attendance_type}","${r.status}","${r.reason || ''}"\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Academy_Report_${month}_${reportTab}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✓ Report exported as CSV', 'success');
  };

  const handleOpenAuditModal = async () => {
    try {
      setLoadingAudit(true);
      setIsAuditModalOpen(true);
      const logs = await api.getAuditLogs();
      setAllAuditLogs(logs);
    } catch (err: any) {
      showToast(err.message || 'Failed to load system audit logs', 'error');
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleDrilldownStudent = (studentItem: MonthlyStudentReportItem) => {
    setDrilldownStudent(studentItem);
  };

  // If inspecting a specific coach's full report, render the dedicated CoachReportDetailView
  if (inspectingCoachId) {
    return (
      <CoachReportDetailView
        coachId={inspectingCoachId}
        initialMonth={month}
        onBack={() => setInspectingCoachId(null)}
        onSelectCoach={(newCoachId) => setInspectingCoachId(newCoachId)}
      />
    );
  }

  // Compute overall summary statistics
  const totalSessions =
    reportData?.coaches_summary.reduce((acc, c) => acc + c.total_sessions_taught, 0) || 0;
  const totalAttendances =
    reportData?.coaches_summary.reduce((acc, c) => acc + c.total_student_attendances, 0) || 0;
  const totalReplacements =
    reportData?.coaches_summary.reduce((acc, c) => acc + c.replacement_sessions_taught, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-full border border-indigo-200 dark:border-indigo-800 inline-block mb-1.5">
            Operations & Teaching Rollup
          </span>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Monthly Attendance Aggregates
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
            Interactive breakdown of teaching hours, replacement duties, student completion metrics, and historical audit logs
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleOpenAuditModal}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-2xl text-xs font-black bg-white dark:bg-neutral-900 hover:bg-slate-50 dark:hover:bg-neutral-800 text-slate-900 dark:text-white border-2 border-slate-900 dark:border-neutral-700 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.1)] transition-all active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Audit Trail</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-2xl text-xs font-black bg-white dark:bg-neutral-900 hover:bg-slate-50 dark:hover:bg-neutral-800 text-slate-900 dark:text-white border-2 border-slate-900 dark:border-neutral-700 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.1)] transition-all active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-2xl text-xs font-black bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.1)] transition-all active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Filter Bento Row */}
      <div className="p-4 rounded-3xl bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Select Month
            </label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Filter by Coach
            </label>
            <select
              value={coachId}
              onChange={(e) => setCoachId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="">All Coaches</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  Coach {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Filter by Class
            </label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="">All Classes</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Bento Cards */}
      {reportData && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#f0f9ff] dark:bg-sky-950/30 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-sky-800 dark:text-sky-300">
              Total Sessions Taught
            </span>
            <div className="mt-2 text-3xl font-black text-slate-900 dark:text-white">
              {totalSessions}
            </div>
            <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Across all assigned academy chess training sessions
            </p>
          </div>

          <div className="bg-[#ecfdf5] dark:bg-emerald-950/30 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800 dark:text-emerald-300">
              Student Attendances
            </span>
            <div className="mt-2 text-3xl font-black text-slate-900 dark:text-white">
              {totalAttendances}
            </div>
            <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Verified physical check-ins recorded
            </p>
          </div>

          <div className="bg-[#fff7ed] dark:bg-amber-950/30 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-300">
              Replacement Sessions
            </span>
            <div className="mt-2 text-3xl font-black text-slate-900 dark:text-white">
              {totalReplacements}
            </div>
            <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Covered by replacement coaches
            </p>
          </div>
        </div>
      )}

      {/* Tabs: Coach Summary vs Student Summary vs Historical Logs */}
      <div className="flex items-center gap-2 border-b-2 border-slate-900 dark:border-neutral-700 pb-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setReportTab('COACH')}
          className={`py-2 px-4 rounded-2xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
            reportTab === 'COACH'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Coach Teaching Breakdown
        </button>
        <button
          onClick={() => setReportTab('STUDENT')}
          className={`py-2 px-4 rounded-2xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
            reportTab === 'STUDENT'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Student Attendance Breakdown
        </button>
        <button
          onClick={() => setReportTab('LOGS')}
          className={`py-2 px-4 rounded-2xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
            reportTab === 'LOGS'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Historical Attendance & Audit Logs
        </button>
      </div>

      {/* Main Tab Content */}
      {loading || !reportData ? (
        <LoadingSkeleton count={4} type="row" />
      ) : reportTab === 'COACH' ? (
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border-2 border-slate-900 dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-neutral-800/80 border-b-2 border-slate-900 dark:border-neutral-700 text-slate-700 dark:text-slate-300 font-black uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-4">Coach</th>
                  <th className="py-3.5 px-4 text-center">Total Sessions</th>
                  <th className="py-3.5 px-4 text-center">Group</th>
                  <th className="py-3.5 px-4 text-center">Individual (1-on-1)</th>
                  <th className="py-3.5 px-4 text-center">Replacements Covered</th>
                  <th className="py-3.5 px-4 text-right">Student Attendances</th>
                  <th className="py-3.5 px-4 text-right">Drill-down</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                {reportData.coaches_summary.map((c) => (
                  <tr
                    key={c.coach_id}
                    onClick={() => setInspectingCoachId(c.coach_id)}
                    className="hover:bg-slate-50/80 dark:hover:bg-neutral-800/60 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2 font-black text-slate-900 dark:text-white">
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-slate-900"
                          style={{ backgroundColor: c.coach_color }}
                        />
                        Coach {c.coach_name}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-black text-slate-900 dark:text-white">
                      {c.total_sessions_taught}
                    </td>
                    <td className="py-3.5 px-4 text-center text-slate-600 dark:text-slate-300 font-bold">
                      {c.group_sessions_count}
                    </td>
                    <td className="py-3.5 px-4 text-center text-slate-600 dark:text-slate-300 font-bold">
                      {c.individual_sessions_count}
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-amber-600 dark:text-amber-400">
                      {c.replacement_sessions_taught}
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-slate-900 dark:text-white">
                      {c.total_student_attendances}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectingCoachId(c.coach_id);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 shadow-xs cursor-pointer"
                      >
                        <span>View Full Report</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : reportTab === 'STUDENT' ? (
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border-2 border-slate-900 dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-neutral-800/80 border-b-2 border-slate-900 dark:border-neutral-700 text-slate-700 dark:text-slate-300 font-black uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-4">Student</th>
                  <th className="py-3.5 px-4">ID</th>
                  <th className="py-3.5 px-4 text-center">Total Scheduled</th>
                  <th className="py-3.5 px-4 text-center">Present</th>
                  <th className="py-3.5 px-4 text-center">Absent</th>
                  <th className="py-3.5 px-4 text-center">Replacements</th>
                  <th className="py-3.5 px-4 text-right">Attendance Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                {reportData.students_summary.map((s) => (
                  <tr
                    key={s.student_id}
                    onClick={() => handleDrilldownStudent(s)}
                    className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/40 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                      {s.student_name}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 font-bold">
                      {s.student_code}
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold">{s.total_scheduled}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-emerald-600">
                      {s.attended_count}
                    </td>
                    <td className="py-3.5 px-4 text-center text-rose-600 font-bold">{s.absent_count}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-blue-600">
                      {s.replacement_count}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-black border ${
                          s.attendance_rate >= 80
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200'
                        }`}
                      >
                        {s.attendance_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* HISTORICAL ATTENDANCE & AUDIT LOGS TAB */
        <div className="space-y-4">
          {/* Subfilter Bar for Logs */}
          <div className="p-4 rounded-3xl bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative min-w-[260px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={recordSearch}
                onChange={(e) => setRecordSearch(e.target.value)}
                placeholder="Search student name or ID..."
                className="w-full pl-9 pr-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900/30 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={recordStatus}
                onChange={(e) => setRecordStatus(e.target.value)}
                className="px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
              >
                <option value="">All Attendance Statuses</option>
                <option value="PRESENT">PRESENT</option>
                <option value="ABSENT">ABSENT</option>
                <option value="LATE">LATE</option>
                <option value="EXCUSED">EXCUSED</option>
              </select>

              <button
                onClick={() => {
                  setRecordSearch('');
                  setRecordStatus('');
                }}
                className="p-2 rounded-xl border-2 border-slate-300 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-600 dark:text-slate-300"
                title="Reset Filters"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Historical Records Table */}
          {loadingRecords ? (
            <LoadingSkeleton count={4} type="row" />
          ) : attendanceRecords.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
              <p className="text-xs font-bold text-slate-400">
                No historical attendance records match the selected month and filters.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-neutral-900 rounded-3xl border-2 border-slate-900 dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-neutral-800/80 border-b-2 border-slate-900 dark:border-neutral-700 text-slate-700 dark:text-slate-300 font-black uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3.5 px-4">Date & Time</th>
                      <th className="py-3.5 px-4">Class & Venue</th>
                      <th className="py-3.5 px-4">Student</th>
                      <th className="py-3.5 px-4">Type</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">Audit Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                    {attendanceRecords.map((r) => {
                      const studentName = r.student?.full_name || r.unregistered_student_name || 'Student';
                      const studentId = r.student?.student_id || 'TRIAL';
                      const className = r.session?.class_item?.name || 'Class';
                      const venue = r.session?.room_location || r.session?.class_item?.room_location || 'Main Hall';
                      const isPresent = r.status === 'PRESENT';
                      const isAbsent = r.status === 'ABSENT';

                      return (
                        <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-neutral-800/40">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {r.session?.session_date || '—'}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {r.session?.start_time} - {r.session?.end_time}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 dark:text-white">{className}</div>
                            <div className="text-[10px] text-slate-500">Venue: {venue}</div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 dark:text-white">{studentName}</div>
                            <div className="text-[10px] font-mono text-slate-500">{studentId}</div>
                          </td>

                          <td className="py-3.5 px-4">
                            {r.attendance_type === 'REPLACEMENT' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 border border-indigo-200">
                                Replacement
                              </span>
                            ) : r.unregistered_student_name ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-violet-100 text-violet-800 border border-violet-200">
                                Trial
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-700">
                                Regular
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            {isPresent ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3" /> Present
                              </span>
                            ) : isAbsent ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-300">
                                <XCircle className="w-3 h-3" /> Absent
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-300">
                                <Clock className="w-3 h-3" /> {r.status}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 text-xs italic">
                            {r.reason || r.replacement_note || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drilldown Modal: Student Summary Breakdown */}
      {drilldownStudent && (
        <Modal
          isOpen={!!drilldownStudent}
          onClose={() => setDrilldownStudent(null)}
          title={`Attendance Record: ${drilldownStudent.student_name} (${drilldownStudent.student_code})`}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2 text-center p-3 rounded-2xl bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-xs">
              <div>
                <span className="text-[10px] uppercase text-slate-400 block font-bold">Scheduled</span>
                <span className="text-base font-black text-slate-900 dark:text-white">
                  {drilldownStudent.total_scheduled}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 block font-bold">Present</span>
                <span className="text-base font-black text-emerald-600">
                  {drilldownStudent.attended_count}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 block font-bold">Absent</span>
                <span className="text-base font-black text-rose-600">
                  {drilldownStudent.absent_count}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 block font-bold">Rate</span>
                <span className="text-base font-black text-indigo-600">
                  {drilldownStudent.attendance_rate}%
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500 font-medium">
              This summary reflects all marked and scheduled attendance sessions for {month}.
            </p>

            <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-neutral-700">
              <button
                onClick={() => setDrilldownStudent(null)}
                className="py-2 px-4 rounded-xl text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Global Audit Trail Modal */}
      <Modal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        title="Academy Attendance Audit Trail"
        subtitle="Complete immutable log of all roll call modifications and administrative corrections."
      >
        <div className="space-y-3">
          {loadingAudit ? (
            <LoadingSkeleton count={3} type="card" />
          ) : allAuditLogs.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs font-bold bg-slate-50 dark:bg-neutral-800 rounded-2xl">
              No audit records found.
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
              {allAuditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-2xl border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-800/60 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 font-bold">
                    <span>{new Date(log.created_at).toLocaleString()}</span>
                    <span className="font-mono bg-slate-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded">
                      User: {log.user?.username || log.user?.email || 'Admin'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                    <span>Status changed from</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800">
                      {log.old_status}
                    </span>
                    <span>→</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800">
                      {log.new_status}
                    </span>
                  </div>
                  {log.reason && (
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 italic pt-0.5">
                      "{log.reason}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setIsAuditModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-black bg-slate-900 dark:bg-white text-white dark:text-slate-900 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
