import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../common/Toast.js';
import { getCurrentMonthString } from '../../lib/dateUtils.js';
import { Coach, ClassSession, AttendanceRecord, AcademyClass } from '../../types.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  Award,
  Download,
  Printer,
  Sparkles,
  ChevronRight,
  MapPin,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  BookOpen,
  Filter,
} from 'lucide-react';

interface CoachReportDetailViewProps {
  coachId: string;
  initialMonth: string;
  onBack: () => void;
  onSelectCoach?: (coachId: string) => void;
}

export const CoachReportDetailView: React.FC<CoachReportDetailViewProps> = ({
  coachId,
  initialMonth,
  onBack,
  onSelectCoach,
}) => {
  const { showToast } = useToast();

  const [selectedMonth, setSelectedMonth] = useState(initialMonth || getCurrentMonthString());
  const [currentCoachId, setCurrentCoachId] = useState(coachId);
  const [selectedClassType, setSelectedClassType] = useState<'ALL' | 'GROUP' | 'INDIVIDUAL'>('ALL');
  
  const [coach, setCoach] = useState<Coach | null>(null);
  const [coachesList, setCoachesList] = useState<Coach[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [classes, setClasses] = useState<AcademyClass[]>([]);
  const [loading, setLoading] = useState(true);

  // Load coach data, sessions, attendance records, and classes
  const loadReportData = async () => {
    try {
      setLoading(true);
      const [allCoaches, coachSessions, records, allClasses] = await Promise.all([
        api.getCoaches(),
        api.getSessions({
          month: selectedMonth,
          coach_id: currentCoachId,
        }),
        api.getAttendanceRecords({
          month: selectedMonth,
          coach_id: currentCoachId,
        }),
        api.getClasses(),
      ]);

      setCoachesList(allCoaches);
      const foundCoach = allCoaches.find((c) => c.id === currentCoachId) || null;
      setCoach(foundCoach);
      setSessions(coachSessions);
      setAttendanceRecords(records);
      setClasses(allClasses);
    } catch (err: any) {
      showToast(err.message || 'Failed to load coach teaching report', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, [currentCoachId, selectedMonth]);

  // Format month string into human-readable e.g., "August 2026"
  const formattedMonthName = useMemo(() => {
    try {
      const [year, m] = selectedMonth.split('-');
      const date = new Date(parseInt(year, 10), parseInt(m, 10) - 1, 1);
      return date.toLocaleString('default', { month: 'long', year: 'numeric' });
    } catch {
      return selectedMonth;
    }
  }, [selectedMonth]);

  // Filter sessions by class type if selected
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      // Exclude off days or cancelled unless they have records
      if (s.status === 'OFF_DAY' || s.status === 'CANCELLED' || s.status === 'COACH_CANCELLED') {
        return false;
      }
      if (selectedClassType === 'ALL') return true;
      const cls = s.class_item || classes.find((c) => c.id === s.class_id);
      if (selectedClassType === 'INDIVIDUAL') {
        return cls?.class_type === 'INDIVIDUAL';
      }
      return cls?.class_type !== 'INDIVIDUAL';
    });
  }, [sessions, selectedClassType, classes]);

  // Helper to parse time string like "09:30" to minutes from midnight
  const parseTimeToMinutes = (timeStr: string): number => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
  };

  // 1. CALCULATE SUMMARY METRICS
  const summaryMetrics = useMemo(() => {
    let totalSessionsTaught = 0;
    let groupSessionsCount = 0;
    let individualSessionsCount = 0;
    let replacementSessionsCount = 0;
    let totalStudentAttendances = 0;
    let totalTeachingMinutes = 0;

    filteredSessions.forEach((sess) => {
      totalSessionsTaught += 1;
      const isReplacement = sess.scheduled_coach_id !== sess.actual_coach_id;
      if (isReplacement) {
        replacementSessionsCount += 1;
      }

      const cls = sess.class_item || classes.find((c) => c.id === sess.class_id);
      if (cls?.class_type === 'INDIVIDUAL') {
        individualSessionsCount += 1;
      } else {
        groupSessionsCount += 1;
      }

      // Calculate attendances from marked records or present_count
      const sessRecords = attendanceRecords.filter((r) => r.session_id === sess.id);
      const presentCount = sessRecords.length > 0
        ? sessRecords.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length
        : sess.present_count || 0;

      totalStudentAttendances += presentCount;

      // Calculate duration
      const startMin = parseTimeToMinutes(sess.start_time);
      const endMin = parseTimeToMinutes(sess.end_time);
      const duration = endMin > startMin ? endMin - startMin : 90; // default 90 mins
      totalTeachingMinutes += duration;
    });

    const totalTeachingHours = (totalTeachingMinutes / 60).toFixed(1);

    return {
      totalSessionsTaught,
      groupSessionsCount,
      individualSessionsCount,
      replacementSessionsCount,
      totalStudentAttendances,
      totalTeachingHours,
    };
  }, [filteredSessions, attendanceRecords, classes]);

  // 2. SECTION 1 — GROUP CLASS BREAKDOWN
  // Group sessions by class_id to compute sessions taught, student count, and attendance summary
  const groupClassBreakdown = useMemo(() => {
    const classMap = new Map<
      string,
      {
        classId: string;
        className: string;
        dayOfWeek: number;
        dayName: string;
        startTime: string;
        endTime: string;
        sessionsTaught: number;
        enrolledStudentIds: Set<string>;
        totalExpectedAttendances: number;
        totalActualAttendances: number;
        sessionIds: string[];
      }
    >();

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    filteredSessions.forEach((sess) => {
      const cls = sess.class_item || classes.find((c) => c.id === sess.class_id);
      if (cls?.class_type === 'INDIVIDUAL') return; // Group classes only

      const classId = sess.class_id;
      const className = cls?.name || 'Group Chess Class';
      const dayOfWeek = cls?.day_of_week ?? new Date(sess.session_date).getDay();
      const dayName = dayNames[dayOfWeek] || 'Saturday';
      const startTime = sess.start_time || cls?.start_time || '09:30';
      const endTime = sess.end_time || cls?.end_time || '11:00';

      if (!classMap.has(classId)) {
        classMap.set(classId, {
          classId,
          className,
          dayOfWeek,
          dayName,
          startTime,
          endTime,
          sessionsTaught: 0,
          enrolledStudentIds: new Set<string>(),
          totalExpectedAttendances: 0,
          totalActualAttendances: 0,
          sessionIds: [],
        });
      }

      const item = classMap.get(classId)!;
      item.sessionsTaught += 1;
      item.sessionIds.push(sess.id);

      // Find students in attendance records
      const sessRecords = attendanceRecords.filter((r) => r.session_id === sess.id);
      sessRecords.forEach((rec) => {
        item.enrolledStudentIds.add(rec.student_id);
        if (rec.status === 'PRESENT' || rec.status === 'LATE') {
          item.totalActualAttendances += 1;
        }
      });
      item.totalExpectedAttendances += Math.max(sessRecords.length, sess.expected_students_count || 0);
    });

    return Array.from(classMap.values());
  }, [filteredSessions, attendanceRecords, classes]);

  // 3. SECTION 2 — STUDENT BREAKDOWN
  // Calculate distinct students taught by this coach and session counts from actual attendance data
  const studentBreakdown = useMemo(() => {
    const studentMap = new Map<
      string,
      {
        studentId: string;
        studentCode: string;
        studentName: string;
        sessionsCount: number;
        presentCount: number;
        replacementCount: number;
        classesAttended: Set<string>;
      }
    >();

    // For every session taught by this coach
    filteredSessions.forEach((sess) => {
      const sessRecords = attendanceRecords.filter((r) => r.session_id === sess.id);
      const cls = sess.class_item || classes.find((c) => c.id === sess.class_id);

      sessRecords.forEach((rec) => {
        const sid = rec.student_id;
        const studentObj = rec.student;

        if (!studentMap.has(sid)) {
          studentMap.set(sid, {
            studentId: sid,
            studentCode: studentObj?.student_id || 'STU',
            studentName: studentObj?.full_name || 'Student',
            sessionsCount: 0,
            presentCount: 0,
            replacementCount: 0,
            classesAttended: new Set<string>(),
          });
        }

        const entry = studentMap.get(sid)!;
        entry.sessionsCount += 1;
        if (rec.status === 'PRESENT' || rec.status === 'LATE') {
          entry.presentCount += 1;
        }
        if (rec.attendance_type === 'REPLACEMENT') {
          entry.replacementCount += 1;
        }
        if (cls?.name) {
          entry.classesAttended.add(cls.name);
        }
      });
    });

    return Array.from(studentMap.values()).sort((a, b) => b.sessionsCount - a.sessionsCount);
  }, [filteredSessions, attendanceRecords, classes]);

  // 4. SECTION 3 — SESSION HISTORY
  // Individual concrete sessions with attendance and replacement details
  const sessionHistory = useMemo(() => {
    return [...filteredSessions].sort((a, b) => a.session_date.localeCompare(b.session_date));
  }, [filteredSessions]);

  // CSV Export for this coach
  const handleExportCSV = () => {
    if (!coach) return;
    let csvContent = 'data:text/csv;charset=utf-8,';

    // Header
    csvContent += `Coach Teaching Report: Coach ${coach.name}\n`;
    csvContent += `Period: ${formattedMonthName}\n`;
    csvContent += `Total Sessions Taught: ${summaryMetrics.totalSessionsTaught}\n`;
    csvContent += `Group Sessions: ${summaryMetrics.groupSessionsCount}\n`;
    csvContent += `Individual Sessions: ${summaryMetrics.individualSessionsCount}\n`;
    csvContent += `Replacement Sessions: ${summaryMetrics.replacementSessionsCount}\n`;
    csvContent += `Total Student Attendances: ${summaryMetrics.totalStudentAttendances}\n`;
    csvContent += `Total Teaching Hours: ${summaryMetrics.totalTeachingHours} hrs\n\n`;

    // Section 1: Group Class Breakdown
    csvContent += '--- SECTION 1: GROUP CLASS BREAKDOWN ---\n';
    csvContent += 'Class Name,Day,Time,Sessions Taught,Students Rostered,Actual Attendances\n';
    groupClassBreakdown.forEach((g) => {
      csvContent += `"${g.className}","${g.dayName}","${g.startTime}–${g.endTime}",${g.sessionsTaught},${g.enrolledStudentIds.size},${g.totalActualAttendances}\n`;
    });
    csvContent += '\n';

    // Section 2: Student Breakdown
    csvContent += '--- SECTION 2: STUDENT BREAKDOWN ---\n';
    csvContent += 'Student Name,Student ID,Sessions Attended,Present,Replacements\n';
    studentBreakdown.forEach((s) => {
      csvContent += `"${s.studentName}","${s.studentCode}",${s.sessionsCount},${s.presentCount},${s.replacementCount}\n`;
    });
    csvContent += '\n';

    // Section 3: Session History
    csvContent += '--- SECTION 3: SESSION HISTORY ---\n';
    csvContent += 'Date,Class Name,Time,Teaching Coach,Attendance,Replacement Status,Session Status\n';
    sessionHistory.forEach((sess) => {
      const cls = sess.class_item || classes.find((c) => c.id === sess.class_id);
      const isRep = sess.scheduled_coach_id !== sess.actual_coach_id;
      const sessRecs = attendanceRecords.filter((r) => r.session_id === sess.id);
      const presCount = sessRecs.length > 0
        ? sessRecs.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length
        : sess.present_count || 0;
      const expCount = Math.max(sessRecs.length, sess.expected_students_count || 0);

      csvContent += `"${sess.session_date}","${cls?.name || 'Class'}","${sess.start_time}–${sess.end_time}","Coach ${coach.name}","${presCount}/${expCount} present","${isRep ? 'Replacement Duty' : 'Regular Assignment'}","${sess.status}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Coach_${coach.name.replace(/\s+/g, '_')}_Report_${selectedMonth}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✓ Coach report exported to CSV', 'success');
  };

  const handlePrint = () => {
    window.print();
  };

  const coachColor = coach?.color || '#3b82f6';
  const coachName = coach?.name || 'Coach';

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 py-2 px-3.5 rounded-2xl text-xs font-black bg-white dark:bg-neutral-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-neutral-700 border-2 border-slate-900 dark:border-neutral-700 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.06)] transition-all active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Reports</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs font-bold">Reports</span>
            <ChevronRight className="w-3 h-3 text-slate-400" />
            <span className="text-slate-900 dark:text-white text-xs font-black">
              Coach {coachName}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-2xl text-xs font-black bg-white dark:bg-neutral-900 hover:bg-slate-50 dark:hover:bg-neutral-800 text-slate-900 dark:text-white border-2 border-slate-900 dark:border-neutral-700 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.1)] transition-all active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-2xl text-xs font-black bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.1)] transition-all active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Main Report Header Bento Card */}
      <div className="bg-white dark:bg-neutral-900 border-3 border-slate-900 dark:border-neutral-700 rounded-3xl p-6 shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.06)] relative overflow-hidden">
        <div
          className="absolute top-0 left-0 right-0 h-3"
          style={{ backgroundColor: coachColor }}
        />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span
                className="w-3.5 h-3.5 rounded-full border border-slate-900"
                style={{ backgroundColor: coachColor }}
              />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                {coach?.color_name || 'Pastel Color'} Coach Portfolio
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              Coach {coachName}
            </h1>
            <p className="text-base sm:text-lg font-bold text-indigo-700 dark:text-indigo-400">
              {formattedMonthName} Teaching Report
            </p>
          </div>

          {/* Interactive Report Filter Controls */}
          <div className="flex items-center gap-3 bg-slate-50 dark:bg-neutral-800/80 p-3 rounded-2xl border-2 border-slate-900 dark:border-neutral-700 flex-wrap">
            <div>
              <label className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Month
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Switch Coach
              </label>
              <select
                value={currentCoachId}
                onChange={(e) => {
                  setCurrentCoachId(e.target.value);
                  if (onSelectCoach) onSelectCoach(e.target.value);
                }}
                className="px-2.5 py-1.5 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-900 dark:text-white"
              >
                {coachesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    Coach {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Program Type
              </label>
              <select
                value={selectedClassType}
                onChange={(e) => setSelectedClassType(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-900 dark:text-white"
              >
                <option value="ALL">All Programs</option>
                <option value="GROUP">Group Classes Only</option>
                <option value="INDIVIDUAL">Individual (1-on-1)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton count={4} type="card" />
      ) : (
        <>
          {/* SUMMARY METRICS ROW */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl p-4 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.06)] flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                Total Sessions
              </span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {summaryMetrics.totalSessionsTaught}
              </div>
              <span className="text-[10px] font-bold text-slate-400 mt-0.5">Sessions Taught</span>
            </div>

            <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl p-4 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.06)] flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Group Sessions
              </span>
              <div className="text-2xl font-black text-indigo-700 dark:text-indigo-300 mt-1">
                {summaryMetrics.groupSessionsCount}
              </div>
              <span className="text-[10px] font-bold text-slate-400 mt-0.5">Group Classes</span>
            </div>

            <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl p-4 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.06)] flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-400">
                Individual
              </span>
              <div className="text-2xl font-black text-sky-700 dark:text-sky-300 mt-1">
                {summaryMetrics.individualSessionsCount}
              </div>
              <span className="text-[10px] font-bold text-slate-400 mt-0.5">1-on-1 Sessions</span>
            </div>

            <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl p-4 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.06)] flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Replacements
              </span>
              <div className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">
                {summaryMetrics.replacementSessionsCount}
              </div>
              <span className="text-[10px] font-bold text-slate-400 mt-0.5">Covered Duties</span>
            </div>

            <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl p-4 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.06)] flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Attendances
              </span>
              <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
                {summaryMetrics.totalStudentAttendances}
              </div>
              <span className="text-[10px] font-bold text-slate-400 mt-0.5">Student Checks</span>
            </div>

            <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl p-4 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.06)] flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
                Teaching Hours
              </span>
              <div className="text-2xl font-black text-purple-700 dark:text-purple-300 mt-1">
                {summaryMetrics.totalTeachingHours}h
              </div>
              <span className="text-[10px] font-bold text-slate-400 mt-0.5">Total Duration</span>
            </div>
          </div>

          {/* SECTION 1 — GROUP CLASS BREAKDOWN */}
          <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] space-y-4">
            <div className="flex items-center justify-between border-b-2 border-slate-900 dark:border-neutral-800 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                  Section 1
                </span>
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  Group Class Breakdown
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-500">
                {groupClassBreakdown.length} classes taught
              </span>
            </div>

            {groupClassBreakdown.length === 0 ? (
              <p className="text-xs font-bold text-slate-400 text-center py-6">
                No group classes taught by Coach {coachName} during {formattedMonthName}.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {groupClassBreakdown.map((item) => {
                  const attendanceRate = item.totalExpectedAttendances > 0
                    ? Math.round((item.totalActualAttendances / item.totalExpectedAttendances) * 100)
                    : 100;

                  return (
                    <div
                      key={item.classId}
                      className="bg-slate-50 dark:bg-neutral-800/80 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl p-4.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-white dark:bg-neutral-900 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-neutral-700">
                            {item.dayName} {item.startTime}–{item.endTime}
                          </span>
                          <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-400">
                            {attendanceRate}% Attendance
                          </span>
                        </div>

                        <h4 className="text-base font-black text-slate-900 dark:text-white pt-1">
                          {item.className}
                        </h4>
                      </div>

                      {/* Class Stats Summary */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-neutral-700 text-xs">
                        <div>
                          <span className="text-[9px] uppercase font-bold text-slate-400 block">
                            Sessions
                          </span>
                          <span className="text-sm font-black text-slate-900 dark:text-white">
                            {item.sessionsTaught} sessions
                          </span>
                        </div>

                        <div>
                          <span className="text-[9px] uppercase font-bold text-slate-400 block">
                            Students
                          </span>
                          <span className="text-sm font-black text-slate-900 dark:text-white">
                            {item.enrolledStudentIds.size} students
                          </span>
                        </div>

                        <div>
                          <span className="text-[9px] uppercase font-bold text-slate-400 block">
                            Attendances
                          </span>
                          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                            {item.totalActualAttendances} check-ins
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 2 — STUDENT BREAKDOWN */}
          <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] space-y-4">
            <div className="flex items-center justify-between border-b-2 border-slate-900 dark:border-neutral-800 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                  Section 2
                </span>
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  Student Breakdown
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-500">
                {studentBreakdown.length} distinct students taught
              </span>
            </div>

            {studentBreakdown.length === 0 ? (
              <p className="text-xs font-bold text-slate-400 text-center py-6">
                No students recorded for Coach {coachName} during {formattedMonthName}.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {studentBreakdown.map((stu) => (
                  <div
                    key={stu.studentId}
                    className="p-3.5 rounded-2xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800/80 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-mono font-bold text-slate-400">
                          {stu.studentCode}
                        </span>
                        {stu.replacementCount > 0 && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border border-amber-300">
                            {stu.replacementCount} Rep
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-black text-slate-900 dark:text-white mt-0.5 truncate">
                        {stu.studentName}
                      </h4>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-neutral-700 flex items-center justify-between text-xs">
                      <span className="font-black text-indigo-700 dark:text-indigo-400">
                        {stu.sessionsCount} sessions
                      </span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {stu.presentCount} attended
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 3 — SESSION HISTORY */}
          <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] space-y-4">
            <div className="flex items-center justify-between border-b-2 border-slate-900 dark:border-neutral-800 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                  Section 3
                </span>
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  Concrete Session History
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-500">
                {sessionHistory.length} total sessions
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-neutral-800/80 border-b-2 border-slate-900 dark:border-neutral-700 text-slate-700 dark:text-slate-300 font-black uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Class</th>
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4">Teaching Coach</th>
                    <th className="py-3 px-4 text-center">Attendance</th>
                    <th className="py-3 px-4 text-center">Duty Type</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                  {sessionHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs font-bold text-slate-400">
                        No session records found for this period.
                      </td>
                    </tr>
                  ) : (
                    sessionHistory.map((sess) => {
                      const cls = sess.class_item || classes.find((c) => c.id === sess.class_id);
                      const isReplacement = sess.scheduled_coach_id !== sess.actual_coach_id;

                      const sessRecs = attendanceRecords.filter((r) => r.session_id === sess.id);
                      const presentCount = sessRecs.length > 0
                        ? sessRecs.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length
                        : sess.present_count || 0;
                      const expectedCount = Math.max(sessRecs.length, sess.expected_students_count || 0);

                      return (
                        <tr
                          key={sess.id}
                          className="hover:bg-slate-50/60 dark:hover:bg-neutral-800/40 transition-colors"
                        >
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                            📅 {sess.session_date}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                            <div>{cls?.name || 'Class'}</div>
                            {sess.room_location && (
                              <div className="text-[10px] text-slate-400 font-normal">
                                {sess.room_location}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-bold">
                            {sess.start_time} – {sess.end_time}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full border border-slate-900"
                                style={{ backgroundColor: coachColor }}
                              />
                              <span>Coach {coachName}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              {presentCount} / {expectedCount} present
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {isReplacement ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border border-amber-300">
                                Replacement Duty
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400">Regular</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-neutral-700">
                              {sess.status === 'SCHEDULED' ? 'Completed' : sess.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
