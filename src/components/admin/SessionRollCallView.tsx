import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../common/Toast.js';
import { formatFullDate } from '../../lib/dateUtils.js';
import { formatMalaysianPhone, isValidMalaysianMobile } from '../../lib/phone.js';
import {
  ClassSession,
  Student,
  AttendanceRecord,
  AttendanceStatus,
  AttendanceAuditLog,
} from '../../types.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';
import { Modal } from '../common/Modal.js';
import {
  ArrowLeft,
  Check,
  X,
  Clock,
  MapPin,
  UserCheck,
  Users,
  UserPlus,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  History,
  Edit2,
  Phone,
  MessageCircle,
  Sparkles,
  RefreshCw,
  HelpCircle,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

interface SessionRollCallViewProps {
  sessionId: string;
  onBack: () => void;
}

export const SessionRollCallView: React.FC<SessionRollCallViewProps> = ({
  sessionId,
  onBack,
}) => {
  const { showToast } = useToast();

  const [session, setSession] = useState<(ClassSession & { enrolled_students?: Student[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);

  // Replacement student modal
  const [isReplacementModalOpen, setIsReplacementModalOpen] = useState(false);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [replacementSearch, setReplacementSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [replacementNote, setReplacementNote] = useState('');
  const [isAddingReplacement, setIsAddingReplacement] = useState(false);

  // Unregistered / Trial student modal
  const [isUnregModalOpen, setIsUnregModalOpen] = useState(false);
  const [unregFullName, setUnregFullName] = useState('');
  const [unregNickName, setUnregNickName] = useState('');
  const [unregParentPhone, setUnregParentPhone] = useState('');
  const [unregStatus, setUnregStatus] = useState<AttendanceStatus>('PRESENT');
  const [unregNote, setUnregNote] = useState('');
  const [isAddingUnreg, setIsAddingUnreg] = useState(false);

  // Attendance Correction with Mandatory Audit Reason Modal
  const [correctingRecord, setCorrectingRecord] = useState<AttendanceRecord | null>(null);
  const [correctionStatus, setCorrectionStatus] = useState<AttendanceStatus>('PRESENT');
  const [auditReason, setAuditReason] = useState('');
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);

  // Session-level Audit Trail Modal
  const [sessionAuditLogs, setSessionAuditLogs] = useState<AttendanceAuditLog[]>([]);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const fetchSession = async () => {
    try {
      setLoading(true);
      const data = await api.getSession(sessionId);
      setSession(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to load session roll call', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, [sessionId]);

  // Load all students for replacement modal search
  useEffect(() => {
    if (isReplacementModalOpen && allStudents.length === 0) {
      api.getStudents({ status: 'ACTIVE' })
        .then(setAllStudents)
        .catch((err) => {
          showToast('Failed to load students for replacement', 'error');
        });
    }
  }, [isReplacementModalOpen, allStudents.length]);

  const handleMarkStatus = async (
    studentId: string,
    studentName: string,
    status: AttendanceStatus,
    attendanceType: 'REGULAR' | 'REPLACEMENT' = 'REGULAR'
  ) => {
    if (!session) return;
    setSavingStudentId(studentId);

    try {
      await api.markAttendance(sessionId, {
        student_id: studentId,
        status,
        attendance_type: attendanceType,
      });

      if (status === 'PRESENT') {
        showToast(`✓ ${studentName}: Checked In (PRESENT)`, 'success', 2000);
      } else if (status === 'ABSENT') {
        showToast(`⚠ ${studentName}: Marked ABSENT`, 'info', 2000);
      } else {
        showToast(`✓ ${studentName}: Marked ${status}`, 'success', 2000);
      }

      const updated = await api.getSession(sessionId);
      setSession(updated);
    } catch (err: any) {
      showToast(err.message || 'Unable to record attendance', 'error');
    } finally {
      setSavingStudentId(null);
    }
  };

  const handleOpenCorrection = (record: AttendanceRecord) => {
    setCorrectingRecord(record);
    setCorrectionStatus(record.status);
    setAuditReason('');
  };

  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingRecord) return;
    if (!auditReason.trim()) {
      showToast('Audit reason is required for administrative attendance corrections', 'error');
      return;
    }

    setIsSavingCorrection(true);
    try {
      await api.correctAttendance(correctingRecord.id, {
        status: correctionStatus,
        audit_reason: auditReason,
      });

      showToast('✓ Attendance record corrected and audit log recorded', 'success');
      setCorrectingRecord(null);
      const updated = await api.getSession(sessionId);
      setSession(updated);
    } catch (err: any) {
      showToast(err.message || 'Failed to correct attendance', 'error');
    } finally {
      setIsSavingCorrection(false);
    }
  };

  const handleAddReplacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) {
      showToast('Please select a student for replacement', 'error');
      return;
    }

    setIsAddingReplacement(true);
    try {
      await api.addReplacementStudent(sessionId, {
        student_id: selectedStudentId,
        replacement_note: replacementNote || 'Attending replacement chess session',
      });

      showToast('✓ Replacement student added and marked present', 'success');
      setIsReplacementModalOpen(false);
      setSelectedStudentId('');
      setReplacementNote('');
      setReplacementSearch('');

      const updated = await api.getSession(sessionId);
      setSession(updated);
    } catch (err: any) {
      showToast(err.message || 'Failed to add replacement student', 'error');
    } finally {
      setIsAddingReplacement(false);
    }
  };

  const handleAddUnregisteredStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unregFullName.trim()) {
      showToast('Student full name is required', 'error');
      return;
    }
    if (unregParentPhone && !isValidMalaysianMobile(unregParentPhone)) {
      showToast('Enter a valid Malaysian mobile number, e.g. 012-345 6789', 'error');
      return;
    }

    setIsAddingUnreg(true);
    try {
      await api.recordUnregisteredStudent(sessionId, {
        full_name: unregFullName.trim(),
        nick_name: unregNickName.trim() || undefined,
        parent_phone: unregParentPhone.trim() || undefined,
        status: unregStatus,
        replacement_note: unregNote.trim() || 'Trial / Walk-in student',
      });

      showToast('✓ Trial / unregistered student added to session roster', 'success');
      setIsUnregModalOpen(false);
      setUnregFullName('');
      setUnregNickName('');
      setUnregParentPhone('');
      setUnregNote('');
      setUnregStatus('PRESENT');

      const updated = await api.getSession(sessionId);
      setSession(updated);
    } catch (err: any) {
      showToast(err.message || 'Failed to add unregistered student', 'error');
    } finally {
      setIsAddingUnreg(false);
    }
  };

  const handleViewAuditLogs = async () => {
    try {
      setLoadingAudit(true);
      setIsAuditModalOpen(true);
      const allLogs = await api.getAuditLogs();
      // Filter logs relevant to this session
      const relevantLogs = allLogs.filter((log) => {
        return (
          log.session_id === sessionId ||
          (session?.attendance_records &&
            session.attendance_records.some((r) => r.id === log.attendance_id))
        );
      });
      setSessionAuditLogs(relevantLogs.length > 0 ? relevantLogs : allLogs.slice(0, 15));
    } catch (err: any) {
      showToast(err.message || 'Failed to load session audit logs', 'error');
    } finally {
      setLoadingAudit(false);
    }
  };

  // Compile full student roster: Enrolled students + Replacement students + Trial students
  const combinedRoster = useMemo(() => {
    if (!session) return [];

    const enrolledMap = new Map<string, Student>();
    (session.enrolled_students || []).forEach((s) => {
      enrolledMap.set(s.id, s);
    });

    const records = session.attendance_records || [];
    const rosterList: Array<{
      key: string;
      studentId: string;
      fullName: string;
      nickName?: string;
      studentCode?: string;
      parentName?: string;
      parentPhone?: string;
      isReplacement: boolean;
      isUnregistered: boolean;
      replacementNote?: string;
      status: AttendanceStatus | 'UNMARKED';
      record?: AttendanceRecord;
    }> = [];

    // Add enrolled students
    (session.enrolled_students || []).forEach((stu) => {
      const rec = records.find((r) => r.student_id === stu.id);
      rosterList.push({
        key: `enrolled-${stu.id}`,
        studentId: stu.id,
        fullName: stu.full_name,
        nickName: stu.nick_name,
        studentCode: stu.student_id,
        parentName: stu.parent_name,
        parentPhone: stu.parent_phone,
        isReplacement: rec?.attendance_type === 'REPLACEMENT',
        isUnregistered: false,
        replacementNote: rec?.replacement_note,
        status: rec ? rec.status : 'UNMARKED',
        record: rec,
      });
    });

    // Add replacement or unregistered students who are in attendance_records but not in enrolled_students
    records.forEach((rec) => {
      if (rec.student_id && !enrolledMap.has(rec.student_id)) {
        rosterList.push({
          key: `replacement-${rec.id}`,
          studentId: rec.student_id,
          fullName: rec.student?.full_name || 'Replacement Student',
          nickName: rec.student?.nick_name,
          studentCode: rec.student?.student_id,
          parentName: rec.student?.parent_name,
          parentPhone: rec.student?.parent_phone,
          isReplacement: true,
          isUnregistered: false,
          replacementNote: rec.replacement_note || 'Replacement Student',
          status: rec.status,
          record: rec,
        });
      } else if (!rec.student_id) {
        // Unregistered / Trial student record
        rosterList.push({
          key: `unreg-${rec.id}`,
          studentId: rec.id,
          fullName: rec.unregistered_student_name || 'Trial Student',
          nickName: rec.unregistered_student_nickname,
          studentCode: 'TRIAL',
          parentName: 'Trial Parent',
          parentPhone: rec.unregistered_parent_phone,
          isReplacement: false,
          isUnregistered: true,
          replacementNote: rec.replacement_note || 'Trial / Walk-in',
          status: rec.status,
          record: rec,
        });
      }
    });

    return rosterList;
  }, [session]);

  // Filtered Roster by Search & Status Filter
  const filteredRoster = useMemo(() => {
    let list = combinedRoster;

    if (statusFilter !== 'ALL') {
      if (statusFilter === 'PRESENT') {
        list = list.filter((item) => item.status === 'PRESENT');
      } else if (statusFilter === 'ABSENT') {
        list = list.filter((item) => item.status === 'ABSENT');
      } else if (statusFilter === 'REPLACEMENT') {
        list = list.filter((item) => item.isReplacement || item.isUnregistered);
      } else if (statusFilter === 'UNMARKED') {
        list = list.filter((item) => item.status === 'UNMARKED');
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((item) => {
        return (
          item.fullName.toLowerCase().includes(q) ||
          (item.nickName && item.nickName.toLowerCase().includes(q)) ||
          (item.studentCode && item.studentCode.toLowerCase().includes(q)) ||
          (item.parentPhone && item.parentPhone.includes(q))
        );
      });
    }

    return list;
  }, [combinedRoster, statusFilter, searchQuery]);

  if (loading || !session) {
    return (
      <div className="space-y-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Sessions Timetable
        </button>
        <LoadingSkeleton count={3} type="card" />
      </div>
    );
  }

  const isCancelled =
    session.status === 'COACH_CANCELLED' ||
    session.status === 'CANCELLED' ||
    session.session_type === 'COACH_CANCELLED';
  const isOffDay =
    session.status === 'PLANNED_OFF_DAY' ||
    session.status === 'OFF_DAY' ||
    session.session_type === 'PLANNED_OFF_DAY';
  const defaultCoach = session.default_coach || session.scheduled_coach;
  const actualCoach = session.teaching_coach || session.actual_coach || defaultCoach;
  const isReplacementCoach =
    !isCancelled &&
    !isOffDay &&
    (session.session_type === 'REPLACEMENT_COACH' ||
      (session.replacement_coach_id && session.replacement_coach_id !== defaultCoach?.id));
  const coachColor = actualCoach?.color || defaultCoach?.color || '#3b82f6';
  const venueName = session.room_location || session.class_item?.room_location || 'Main Hall';

  const presentCount = combinedRoster.filter((r) => r.status === 'PRESENT').length;
  const absentCount = combinedRoster.filter((r) => r.status === 'ABSENT').length;
  const replacementCount = combinedRoster.filter((r) => r.isReplacement || r.isUnregistered).length;
  const totalCount = combinedRoster.length;
  const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-800 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            id="back-to-sessions-btn"
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-neutral-700 text-xs font-black shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] transition cursor-pointer self-start"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Sessions Timetable</span>
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="view-session-audit-btn"
              type="button"
              onClick={handleViewAuditLogs}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 text-slate-800 dark:text-slate-200 border-2 border-slate-900 dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] transition cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Audit History</span>
            </button>

            <button
              id="add-replacement-btn"
              type="button"
              onClick={() => setIsReplacementModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-2 border-indigo-300 dark:border-indigo-700 hover:bg-indigo-100 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] transition cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Add Replacement Student</span>
            </button>

            <button
              id="add-trial-btn"
              type="button"
              onClick={() => setIsUnregModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-2 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>+ Add Trial Student</span>
            </button>
          </div>
        </div>

        {/* Session Details Header */}
        <div className="pt-2 border-t border-slate-100 dark:border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                Session Roll Call Inspection
              </span>
              <span className="text-xs font-black text-slate-700 dark:text-slate-300">
                {formatFullDate(session.session_date)}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-neutral-700">
                <Clock className="w-3 h-3 text-slate-500" />
                {session.start_time} – {session.end_time}
              </span>
            </div>

            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {session.class_item?.name || 'Chess Training Class'}
            </h1>

            <div className="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-400 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Venue: {venueName}
              </span>
              <span>•</span>
              <div className="inline-flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: coachColor }}
                />
                <span>
                  Coach: <strong className="text-slate-900 dark:text-white">{actualCoach?.name || 'Unassigned'}</strong>
                </span>
                {isReplacementCoach && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                    Replacement for {defaultCoach?.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Status Badge */}
          <div>
            {isCancelled ? (
              <span className="px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-2 border-rose-300 dark:border-rose-800">
                Session Cancelled
              </span>
            ) : isOffDay ? (
              <span className="px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-200 text-slate-800 dark:bg-neutral-800 dark:text-slate-300 border-2 border-slate-300 dark:border-neutral-700">
                Planned Off-Day
              </span>
            ) : (
              <span className="px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-2 border-emerald-300 dark:border-emerald-800">
                Active Session
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-800 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
          <span className="text-[10px] font-black uppercase text-slate-500 block">Total Students</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white mt-1 block">{totalCount}</span>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border-2 border-emerald-500 dark:border-emerald-700 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
          <span className="text-[10px] font-black uppercase text-emerald-800 dark:text-emerald-300 block">Present (Checked In)</span>
          <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1 block">{presentCount}</span>
        </div>

        <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border-2 border-rose-400 dark:border-rose-800 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
          <span className="text-[10px] font-black uppercase text-rose-800 dark:text-rose-300 block">Absent</span>
          <span className="text-2xl font-black text-rose-700 dark:text-rose-300 mt-1 block">{absentCount}</span>
        </div>

        <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border-2 border-indigo-400 dark:border-indigo-800 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
          <span className="text-[10px] font-black uppercase text-indigo-800 dark:text-indigo-300 block">Replacements / Trial</span>
          <span className="text-2xl font-black text-indigo-700 dark:text-indigo-300 mt-1 block">{replacementCount}</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-800 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] col-span-2 sm:col-span-1">
          <span className="text-[10px] font-black uppercase text-slate-500 block">Attendance Rate</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white mt-1 block">{attendanceRate}%</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-800 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'ALL', label: `All (${totalCount})` },
            { id: 'PRESENT', label: `Present (${presentCount})` },
            { id: 'ABSENT', label: `Absent (${absentCount})` },
            { id: 'REPLACEMENT', label: `Replacements (${replacementCount})` },
            { id: 'UNMARKED', label: `Unmarked (${totalCount - presentCount - absentCount})` },
          ].map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setStatusFilter(pill.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer ${
                statusFilter === pill.id
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                  : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student or ID..."
            className="w-full pl-9 pr-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900/20 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-slate-900"
          />
        </div>
      </div>

      {/* Roster Roll Call Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-3xl border-2 border-slate-900 dark:border-neutral-800 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-neutral-800/80 border-b-2 border-slate-900 dark:border-neutral-700 text-slate-600 dark:text-slate-400 font-black uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Student & Nickname</th>
                <th className="py-3.5 px-4">Student ID</th>
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4">Roll Call Status</th>
                <th className="py-3.5 px-4">Parent Contact</th>
                <th className="py-3.5 px-4 text-right">Quick Roll Call Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
              {filteredRoster.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-bold">
                    No students match the current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRoster.map((item) => {
                  const isPresent = item.status === 'PRESENT';
                  const isAbsent = item.status === 'ABSENT';
                  const isLate = item.status === 'LATE';
                  const isExcused = item.status === 'EXCUSED';
                  const isSaving = savingStudentId === item.studentId;

                  return (
                    <tr
                      key={item.key}
                      className={`hover:bg-slate-50/70 dark:hover:bg-neutral-800/40 transition-colors ${
                        isPresent
                          ? 'bg-emerald-50/20 dark:bg-emerald-950/10'
                          : isAbsent
                          ? 'bg-rose-50/20 dark:bg-rose-950/10'
                          : ''
                      }`}
                    >
                      {/* Student Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center text-xs font-black shrink-0 shadow-2xs">
                            {item.fullName.substring(0, 1)}
                          </div>
                          <div>
                            <div className="font-black text-slate-900 dark:text-white">
                              {item.fullName}
                            </div>
                            {item.nickName && (
                              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                "{item.nickName}"
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Student ID */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {item.studentCode || '—'}
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-4">
                        {item.isUnregistered ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 border border-violet-200">
                            Trial / Walk-in
                          </span>
                        ) : item.isReplacement ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200">
                            Replacement
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-slate-300">
                            Regular
                          </span>
                        )}
                        {item.replacementNote && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[150px]">
                            {item.replacementNote}
                          </div>
                        )}
                      </td>

                      {/* Roll Call Status Badge */}
                      <td className="py-3.5 px-4">
                        {isPresent ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3" /> Present
                          </span>
                        ) : isAbsent ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300">
                            <XCircle className="w-3 h-3" /> Absent
                          </span>
                        ) : isLate ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                            <Clock className="w-3 h-3" /> Late
                          </span>
                        ) : isExcused ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-slate-200 text-slate-800 dark:bg-neutral-800 dark:text-slate-300 border border-slate-300">
                            <HelpCircle className="w-3 h-3" /> Excused
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-500 dark:bg-neutral-800 dark:text-slate-400">
                            Unmarked
                          </span>
                        )}
                      </td>

                      {/* Parent Contact & WhatsApp */}
                      <td className="py-3.5 px-4">
                        {item.parentPhone ? (
                          <div className="flex items-center gap-2">
                            <div>
                              <div className="font-bold text-slate-800 dark:text-slate-200">
                                {item.parentName || 'Parent'}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {item.parentPhone}
                              </div>
                            </div>
                            <a
                              href={`https://wa.me/${item.parentPhone.replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200 transition"
                              title="Message parent on WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No contact</span>
                        )}
                      </td>

                      {/* Quick Roll Call Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Present Button */}
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() =>
                              handleMarkStatus(
                                item.studentId,
                                item.fullName,
                                'PRESENT',
                                item.isReplacement ? 'REPLACEMENT' : 'REGULAR'
                              )
                            }
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                              isPresent
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300'
                            }`}
                            title="Mark Present"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Present</span>
                          </button>

                          {/* Absent Button */}
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() =>
                              handleMarkStatus(
                                item.studentId,
                                item.fullName,
                                'ABSENT',
                                item.isReplacement ? 'REPLACEMENT' : 'REGULAR'
                              )
                            }
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                              isAbsent
                                ? 'bg-rose-600 text-white shadow-2xs'
                                : 'bg-rose-50 hover:bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300'
                            }`}
                            title="Mark Absent"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Absent</span>
                          </button>

                          {/* Edit / Audit Reason modal button */}
                          {item.record && (
                            <button
                              type="button"
                              onClick={() => handleOpenCorrection(item.record!)}
                              className="p-1.5 rounded-xl border border-slate-300 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                              title="Audit Correction"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================================================= */}
      {/* 1. Modal: Add Replacement Student                       */}
      {/* ======================================================= */}
      <Modal
        isOpen={isReplacementModalOpen}
        onClose={() => setIsReplacementModalOpen(false)}
        title="Add Replacement Student to Session"
        subtitle="Search any active academy student to attend this class as a replacement."
      >
        <form onSubmit={handleAddReplacement} className="space-y-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Search Student
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={replacementSearch}
                onChange={(e) => setReplacementSearch(e.target.value)}
                placeholder="Type student name or ID..."
                className="w-full pl-9 pr-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 border-2 border-slate-200 dark:border-neutral-700 p-2 rounded-xl">
            {allStudents
              .filter((s) => {
                if (!replacementSearch.trim()) return true;
                const q = replacementSearch.toLowerCase();
                return (
                  s.full_name.toLowerCase().includes(q) ||
                  (s.nick_name && s.nick_name.toLowerCase().includes(q)) ||
                  (s.student_id && s.student_id.toLowerCase().includes(q))
                );
              })
              .map((s) => (
                <div
                  key={s.id}
                  onClick={() => setSelectedStudentId(s.id)}
                  className={`p-2 rounded-xl flex items-center justify-between cursor-pointer text-xs font-bold transition ${
                    selectedStudentId === s.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-50 dark:bg-neutral-800 hover:bg-slate-100 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div>
                    <div>{s.full_name} {s.nick_name && `(${s.nick_name})`}</div>
                    <div className="text-[10px] opacity-80">{s.student_id}</div>
                  </div>
                  {selectedStudentId === s.id && <Check className="w-4 h-4" />}
                </div>
              ))}
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Replacement Note / Reason
            </label>
            <input
              type="text"
              value={replacementNote}
              onChange={(e) => setReplacementNote(e.target.value)}
              placeholder="e.g. Attending make-up class for missed session"
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setIsReplacementModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAddingReplacement || !selectedStudentId}
              className="px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              {isAddingReplacement ? 'Adding...' : 'Confirm Replacement'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ======================================================= */}
      {/* 2. Modal: Add Trial / Unregistered Student              */}
      {/* ======================================================= */}
      <Modal
        isOpen={isUnregModalOpen}
        onClose={() => setIsUnregModalOpen(false)}
        title="Add Trial or Walk-in Student"
        subtitle="Record attendance for a prospective or trial student not yet registered."
      >
        <form onSubmit={handleAddUnregisteredStudent} className="space-y-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Student Full Name *
            </label>
            <input
              type="text"
              required
              value={unregFullName}
              onChange={(e) => setUnregFullName(e.target.value)}
              placeholder="e.g. Marcus Lee"
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Nickname
              </label>
              <input
                type="text"
                value={unregNickName}
                onChange={(e) => setUnregNickName(e.target.value)}
                placeholder="e.g. Mark"
                className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Parent Phone
              </label>
              <input
                type="text"
                inputMode="tel"
                maxLength={12}
                value={unregParentPhone}
                onChange={(e) => setUnregParentPhone(formatMalaysianPhone(e.target.value))}
                placeholder="e.g. 012-345 6789"
                className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Trial Note
            </label>
            <input
              type="text"
              value={unregNote}
              onChange={(e) => setUnregNote(e.target.value)}
              placeholder="e.g. Trial chess evaluation session"
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setIsUnregModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAddingUnreg || !unregFullName.trim()}
              className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              {isAddingUnreg ? 'Adding...' : 'Add Trial Student'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ======================================================= */}
      {/* 3. Modal: Attendance Correction with Mandatory Reason   */}
      {/* ======================================================= */}
      <Modal
        isOpen={Boolean(correctingRecord)}
        onClose={() => setCorrectingRecord(null)}
        title="Administrative Attendance Correction"
        subtitle="Modify attendance status with a required audit reason."
      >
        <form onSubmit={handleSaveCorrection} className="space-y-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Student
            </label>
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-neutral-800 text-xs font-bold text-slate-900 dark:text-white">
              {correctingRecord?.student?.full_name || correctingRecord?.unregistered_student_name || 'Student'} ({correctingRecord?.student?.student_id || 'ID'})
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Target Attendance Status
            </label>
            <select
              value={correctionStatus}
              onChange={(e) => setCorrectionStatus(e.target.value as AttendanceStatus)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="PRESENT">PRESENT</option>
              <option value="ABSENT">ABSENT</option>
              <option value="LATE">LATE</option>
              <option value="EXCUSED">EXCUSED</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Audit Reason * <span className="text-[10px] text-slate-500">(Mandatory for audit trail)</span>
            </label>
            <textarea
              required
              rows={3}
              value={auditReason}
              onChange={(e) => setAuditReason(e.target.value)}
              placeholder="e.g. Parent verified student arrived late due to traffic; corrected from Absent to Present."
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setCorrectingRecord(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingCorrection || !auditReason.trim()}
              className="px-4 py-2 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              {isSavingCorrection ? 'Saving...' : 'Save Audit Correction'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ======================================================= */}
      {/* 4. Modal: Session Audit Trail Logs                      */}
      {/* ======================================================= */}
      <Modal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        title="Session Attendance Audit History"
        subtitle="Comprehensive log of all roll-call modifications and administrative overrides."
      >
        <div className="space-y-3">
          {loadingAudit ? (
            <LoadingSkeleton count={3} type="card" />
          ) : sessionAuditLogs.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs font-bold bg-slate-50 dark:bg-neutral-800 rounded-2xl">
              No audit corrections recorded yet for this session.
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
              {sessionAuditLogs.map((log) => (
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
