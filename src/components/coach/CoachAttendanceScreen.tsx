import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../common/Toast.js';
import { api } from '../../lib/api.js';
import { getTodayDateString } from '../../lib/dateUtils.js';
import { formatMalaysianPhone, isValidMalaysianMobile } from '../../lib/phone.js';
import { ClassSession, Student, AttendanceRecord, AttendanceStatus } from '../../types.js';
import {
  ArrowLeft,
  Check,
  X,
  Clock,
  UserPlus,
  Search,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Send,
  SendHorizontal,
  MessageCircle,
  Phone,
  School,
  UserCheck,
  Lock,
} from 'lucide-react';
import { Modal } from '../common/Modal.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';

interface CoachAttendanceScreenProps {
  sessionId: string;
  onBack: () => void;
}

export const CoachAttendanceScreen: React.FC<CoachAttendanceScreenProps> = ({
  sessionId,
  onBack,
}) => {
  const { user, coachProfile } = useAuth();
  const { showToast } = useToast();

  const [session, setSession] = useState<(ClassSession & { enrolled_students?: Student[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);

  // Replacement student modal
  const [isReplacementModalOpen, setIsReplacementModalOpen] = useState(false);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [replacementSearch, setReplacementSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [replacementNote, setReplacementNote] = useState('');
  const [isAddingReplacement, setIsAddingReplacement] = useState(false);

  // Unregistered student modal
  const [isUnregModalOpen, setIsUnregModalOpen] = useState(false);
  const [unregFullName, setUnregFullName] = useState('');
  const [unregNickName, setUnregNickName] = useState('');
  const [unregParentPhone, setUnregParentPhone] = useState('');
  const [unregStatus, setUnregStatus] = useState<'PRESENT' | 'ABSENT'>('PRESENT');
  const [unregNote, setUnregNote] = useState('');
  const [isAddingUnreg, setIsAddingUnreg] = useState(false);

  const fetchSession = async () => {
    try {
      setLoading(true);
      const data = await api.getSession(sessionId);
      setSession(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to load session attendance', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, [sessionId]);

  // Load all students for replacement search when modal opens
  useEffect(() => {
    if (isReplacementModalOpen && allStudents.length === 0) {
      api.getStudents({ status: 'ACTIVE' })
        .then((stus) => setAllStudents(stus || []))
        .catch(() => {
          showToast('Failed to load students list for replacement', 'error');
        });
    }
  }, [isReplacementModalOpen, allStudents.length]);

  const handleMarkStatus = async (
    studentId: string,
    studentName: string,
    status: 'PRESENT' | 'ABSENT',
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
        showToast(`✓ ${studentName}: PRESENT (Attendance recorded)`, 'success', 2000);
      } else {
        showToast(`✕ ${studentName}: ABSENT (Attendance recorded)`, 'info', 2000);
      }

      // Reload session
      const updated = await api.getSession(sessionId);
      setSession(updated);
    } catch (err: any) {
      showToast(err.message || 'Unable to save attendance', 'error');
    } finally {
      setSavingStudentId(null);
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
        replacement_note: unregNote.trim() || 'Unregistered walk-in / trial student',
      });

      showToast(`✓ Recorded unregistered student ${unregFullName} as ${unregStatus}`, 'success');
      setIsUnregModalOpen(false);
      setUnregFullName('');
      setUnregNickName('');
      setUnregParentPhone('');
      setUnregNote('');
      setUnregStatus('PRESENT');

      const updated = await api.getSession(sessionId);
      setSession(updated);
    } catch (err: any) {
      showToast(err.message || 'Failed to record unregistered student', 'error');
    } finally {
      setIsAddingUnreg(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-black text-slate-900 dark:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Classes
        </button>
        <LoadingSkeleton count={4} type="card" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-500 text-sm mb-4 font-bold">Session details unavailable.</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black"
        >
          Back to classes
        </button>
      </div>
    );
  }

  // Combine enrolled students with attendance records
  const attendanceMap = new Map<string, AttendanceRecord>();
  session.attendance_records?.forEach((rec) => {
    if (rec && rec.student_id) {
      attendanceMap.set(rec.student_id, rec);
    }
  });

  interface StudentRollItem {
    student: Student;
    record?: AttendanceRecord;
    isReplacement: boolean;
    isUnregistered: boolean;
  }

  const rollList: StudentRollItem[] = [];

  // Add enrolled students
  session.enrolled_students?.forEach((stu) => {
    if (!stu) return;
    const record = attendanceMap.get(stu.id);
    rollList.push({
      student: stu,
      record,
      isReplacement: record?.attendance_type === 'REPLACEMENT',
      isUnregistered: !!stu.is_unregistered || (typeof stu.student_id === 'string' && stu.student_id.startsWith('UNREG-')),
    });
  });

  // Add replacement or unregistered students who are in attendance_records but not in enrolled_students
  session.attendance_records?.forEach((rec) => {
    if (rec && rec.student_id && !rollList.some((r) => r.student.id === rec.student_id)) {
      if (rec.student) {
        rollList.push({
          student: rec.student,
          record: rec,
          isReplacement: rec.attendance_type === 'REPLACEMENT',
          isUnregistered: !!rec.student.is_unregistered || (typeof rec.student.student_id === 'string' && rec.student.student_id.startsWith('UNREG-')),
        });
      }
    }
  });

  // Filter roll by search query
  const filteredRoll = rollList.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (item.student?.full_name && item.student.full_name.toLowerCase().includes(q)) ||
      (item.student?.student_id && item.student.student_id.toLowerCase().includes(q)) ||
      (item.student?.nick_name && item.student.nick_name.toLowerCase().includes(q))
    );
  });

  // Stats calculation: Present + Absent + Unmarked = Expected / Total Students
  const totalStudents = rollList.length;
  const presentCount = rollList.filter((item) => item.record?.status === 'PRESENT').length;
  const absentCount = rollList.filter((item) => item.record?.status === 'ABSENT').length;
  const unmarkedCount = rollList.filter(
    (item) => !item.record || (item.record.status !== 'PRESENT' && item.record.status !== 'ABSENT')
  ).length;

  const isCancelled = session.status === 'COACH_CANCELLED' || session.status === 'CANCELLED' || session.session_type === 'COACH_CANCELLED';
  const isOffDay = session.status === 'PLANNED_OFF_DAY' || session.status === 'OFF_DAY' || session.session_type === 'PLANNED_OFF_DAY';
  const isReplacementCoach = !isCancelled && !isOffDay && session.scheduled_coach_id !== session.actual_coach_id;
  const coachColor = isCancelled ? '#ef4444' : isOffDay ? '#94a3b8' : (session.actual_coach?.color || coachProfile?.color || '#3b82f6');

  const todayStr = getTodayDateString();
  const isFutureSession = session.session_date > todayStr && user?.role !== 'ADMIN';

  // Filter candidate students for replacement modal
  const existingStudentIds = new Set(rollList.map((r) => r.student?.id).filter(Boolean));
  const candidateStudents = allStudents
    .filter((s) => s && !existingStudentIds.has(s.id))
    .filter((s) => {
      if (!replacementSearch) return true;
      const q = replacementSearch.toLowerCase().trim();
      return (
        (s.full_name && s.full_name.toLowerCase().includes(q)) ||
        (s.student_id && s.student_id.toLowerCase().includes(q)) ||
        (s.nick_name && s.nick_name.toLowerCase().includes(q))
      );
    });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6">
      {/* Top Navigation & Class Bento Card */}
      <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-5 sm:p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] relative overflow-hidden">
        <div
          className="absolute top-0 left-0 right-0 h-2"
          style={{ backgroundColor: coachColor }}
        />

        <div className="flex items-center justify-between gap-3 mb-4">
          <button
            id="back-to-classes-btn"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-black text-slate-900 dark:text-white bg-slate-100 dark:bg-neutral-800 border border-slate-300 dark:border-neutral-700 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Sessions</span>
          </button>

          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full border border-slate-900"
              style={{ backgroundColor: coachColor }}
            />
            <span className="text-[11px] font-black text-slate-700 dark:text-slate-300">
              {isCancelled ? 'Cancelled Class' : `Coach ${session.actual_coach?.name || user?.name}`}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {session.class_item?.name || 'Group Training'}
              </h2>
              {isCancelled && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200">
                  Coach Cancelled
                </span>
              )}
              {isOffDay && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-200 dark:bg-neutral-800 border border-slate-300 dark:border-neutral-700 text-slate-800 dark:text-slate-200">
                  5th-Week Off Day
                </span>
              )}
              {isReplacementCoach && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200">
                  Replacement Coach
                </span>
              )}
              {isFutureSession && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-sky-100 dark:bg-sky-950/60 border border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-200">
                  <Lock className="w-3 h-3" />
                  Future Session
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {session.session_date} ({session.start_time} – {session.end_time})
              </span>
              {session.room_location && <span>• Venue: {session.room_location}</span>}
            </div>
          </div>

          {/* Quick Roll Summary Badges */}
          <div className="flex items-center gap-2">
            <div className="bg-[#ecfdf5] dark:bg-emerald-950/40 border-2 border-slate-900 dark:border-neutral-700 px-3.5 py-1.5 rounded-2xl text-center shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <span className="block text-[9px] font-black uppercase text-emerald-800 dark:text-emerald-300">
                Present
              </span>
              <span className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                {presentCount}
              </span>
            </div>
            <div className="bg-[#fff1f2] dark:bg-rose-950/40 border-2 border-slate-900 dark:border-neutral-700 px-3.5 py-1.5 rounded-2xl text-center shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <span className="block text-[9px] font-black uppercase text-rose-800 dark:text-rose-300">
                Absent
              </span>
              <span className="text-sm font-black text-rose-700 dark:text-rose-300">
                {absentCount}
              </span>
            </div>
            <div className="bg-[#f8fafc] dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 px-3.5 py-1.5 rounded-2xl text-center shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <span className="block text-[9px] font-black uppercase text-slate-500">
                Unmarked
              </span>
              <span className="text-sm font-black text-slate-700 dark:text-slate-300">
                {unmarkedCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Future Session Notification Banner */}
      {isFutureSession && (
        <div className="p-4 rounded-3xl bg-sky-50 dark:bg-sky-950/40 border-2 border-sky-300 dark:border-sky-800 text-sky-950 dark:text-sky-200 flex items-start gap-3 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
          <Lock className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-black">Future Session — Attendance Locked</h4>
            <p className="text-xs font-medium">
              Attendance recording opens on the scheduled date: <b>{session.session_date}</b>. You can preview roster and student contacts ahead of time.
            </p>
          </div>
        </div>
      )}

      {/* Cancellation Banner */}
      {isCancelled && (
        <div className="p-4 rounded-3xl bg-rose-100/90 dark:bg-rose-950/60 border-2 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-200 flex items-start gap-3 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-black">This Class Has Been Cancelled by Coach</h4>
            <p className="text-xs font-medium">
              Reason: <span className="font-bold">{session.cancellation_reason || 'Coach is unavailable / on leave.'}</span>
            </p>
            <p className="text-[11px] opacity-80">
              Roll call is disabled for this session. To restore or assign a replacement coach, change the session type in Admin Sessions Management.
            </p>
          </div>
        </div>
      )}

      {/* Off-Day Banner */}
      {isOffDay && (
        <div className="p-4 rounded-3xl bg-slate-100 dark:bg-neutral-800 border-2 border-slate-300 dark:border-neutral-700 text-slate-800 dark:text-slate-200 flex items-start gap-3 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
          <HelpCircle className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-black">Scheduled Academy Off-Day</h4>
            <p className="text-xs font-medium">{session.cancellation_reason || '5th week monthly break or public holiday.'}</p>
          </div>
        </div>
      )}

      {/* Action Bar: Search, Add Replacement, & Record Unregistered Student */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            id="coach-student-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student full name, nickname, or Student ID..."
            className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm font-bold rounded-2xl border-2 border-slate-900 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.06)] focus:outline-none"
          />
        </div>

        <button
          id="record-unregistered-student-btn"
          onClick={() => setIsUnregModalOpen(true)}
          disabled={isCancelled || isOffDay || isFutureSession}
          className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl text-xs font-black bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-2 border-slate-900 dark:border-amber-700 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] transition-all active:translate-x-0.5 active:translate-y-0.5 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <UserCheck className="w-4 h-4 text-amber-700" />
          <span>+ Record Unregistered Student</span>
        </button>

        <button
          id="add-replacement-student-btn"
          onClick={() => setIsReplacementModalOpen(true)}
          disabled={isCancelled || isOffDay || isFutureSession}
          className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl text-xs font-black bg-white dark:bg-neutral-900 hover:bg-slate-50 dark:hover:bg-neutral-800 text-slate-900 dark:text-white border-2 border-slate-900 dark:border-neutral-700 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.06)] transition-all active:translate-x-0.5 active:translate-y-0.5 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Add Replacement Student</span>
        </button>
      </div>

      {/* Student List */}
      <div className="space-y-3">
        {filteredRoll.length === 0 ? (
          <div className="p-8 text-center rounded-3xl border-2 border-slate-900 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
            <p className="text-xs font-bold text-slate-500">
              No students match "{searchQuery}"
            </p>
          </div>
        ) : (
          filteredRoll.map(({ student, record, isReplacement, isUnregistered }) => {
            const status = record?.status;
            const isSaving = savingStudentId === student.id;
            const studentFullName = student?.full_name || 'Student';
            const studentId = student?.student_id || '';
            const initials = studentFullName
              .trim()
              .split(/\s+/)
              .map((n) => n[0])
              .join('')
              .substring(0, 2)
              .toUpperCase();

            return (
              <div
                key={student.id}
                id={`roll-student-${student.id}`}
                className={`p-4 sm:p-5 rounded-3xl border-2 border-slate-900 dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] transition-all ${
                  status === 'PRESENT'
                    ? 'bg-[#ecfdf5] dark:bg-emerald-950/20'
                    : status === 'ABSENT'
                    ? 'bg-[#fff1f2] dark:bg-rose-950/20'
                    : 'bg-white dark:bg-neutral-900'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Student Details */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-xs flex items-center justify-center border-2 border-slate-900 flex-shrink-0">
                      {initials}
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                          {studentFullName}
                        </h4>
                        {student.nick_name && (
                          <span className="text-xs font-bold text-slate-500">
                            ({student.nick_name})
                          </span>
                        )}
                        {isUnregistered && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-950 border-2 border-amber-500 uppercase tracking-wider animate-pulse">
                            UNREGISTERED
                          </span>
                        )}
                        {isReplacement && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 border border-blue-300">
                            Replacement
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 text-xs text-slate-500 font-bold flex-wrap">
                        {studentId && <span className="font-mono">{studentId}</span>}
                        {student.school && <span>• {student.school}</span>}
                        {student.parent?.name && (
                          <span>• Parent: {student.parent.name}</span>
                        )}
                        {student.parent?.phone && (
                          <span>• Tel: {student.parent.phone}</span>
                        )}
                      </div>

                      {record?.replacement_note && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 font-bold italic mt-1">
                          Note: {record.replacement_note}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 2 Direct 1-Tap Attendance Actions: [ ✓ Present ] [ ✕ Absent ] */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {/* PRESENT */}
                    <button
                      type="button"
                      disabled={isSaving || isCancelled || isOffDay || isFutureSession}
                      onClick={() =>
                        handleMarkStatus(
                          student.id,
                          studentFullName,
                          'PRESENT',
                          isReplacement ? 'REPLACEMENT' : 'REGULAR'
                        )
                      }
                      className={`h-9 px-4 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all border-2 border-slate-900 ${
                        status === 'PRESENT'
                          ? 'bg-emerald-600 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] scale-105'
                          : 'bg-white hover:bg-emerald-50 text-slate-900 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Present</span>
                    </button>

                    {/* ABSENT */}
                    <button
                      type="button"
                      disabled={isSaving || isCancelled || isOffDay || isFutureSession}
                      onClick={() =>
                        handleMarkStatus(
                          student.id,
                          studentFullName,
                          'ABSENT',
                          isReplacement ? 'REPLACEMENT' : 'REGULAR'
                        )
                      }
                      className={`h-9 px-4 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all border-2 border-slate-900 ${
                        status === 'ABSENT'
                          ? 'bg-rose-600 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] scale-105'
                          : 'bg-white hover:bg-rose-50 text-slate-900 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
                      }`}
                    >
                      <X className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Absent</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Unregistered Student Modal */}
      <Modal
        isOpen={isUnregModalOpen}
        onClose={() => setIsUnregModalOpen(false)}
        title="Record Unregistered Student (Trial / Walk-in)"
      >
        <form onSubmit={handleAddUnregisteredStudent} className="space-y-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200">
            💡 <b>Quick Roll-call Inclusion:</b> Creates a temporary <b>UNREGISTERED</b> record with a temporary ID. This student can immediately participate in roll call. Admin will be notified and can formally convert to an enrolled student with classes later.
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
              Student Full Name *
            </label>
            <input
              type="text"
              required
              value={unregFullName}
              onChange={(e) => setUnregFullName(e.target.value)}
              placeholder="e.g. Benjamin Hayes"
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                Nickname
              </label>
              <input
                type="text"
                value={unregNickName}
                onChange={(e) => setUnregNickName(e.target.value)}
                placeholder="e.g. Ben"
                className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                Parent Phone
              </label>
              <input
                type="text"
                inputMode="tel"
                maxLength={12}
                value={unregParentPhone}
                onChange={(e) => setUnregParentPhone(formatMalaysianPhone(e.target.value))}
                placeholder="e.g. 012-345 6789"
                className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
              Initial Roll Call Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['PRESENT', 'ABSENT'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setUnregStatus(st)}
                  className={`py-2 px-3 rounded-xl text-xs font-black border-2 border-slate-900 transition-all cursor-pointer ${
                    unregStatus === st
                      ? st === 'PRESENT'
                        ? 'bg-emerald-600 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]'
                        : 'bg-rose-600 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]'
                      : 'bg-white text-slate-900 hover:bg-slate-100 dark:bg-neutral-800 dark:text-white'
                  }`}
                >
                  {st === 'PRESENT' ? '✓ Present' : '✕ Absent'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
              Trial / Walk-in Notes
            </label>
            <textarea
              rows={2}
              value={unregNote}
              onChange={(e) => setUnregNote(e.target.value)}
              placeholder="e.g. First trial lesson walk-in, accompanied by parent..."
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsUnregModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-black bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!unregFullName.trim() || isAddingUnreg}
              className="px-4 py-2 rounded-xl text-xs font-black bg-amber-400 hover:bg-amber-500 text-slate-900 border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] disabled:opacity-40 cursor-pointer"
            >
              {isAddingUnreg ? 'Recording...' : 'Record & Add to Roll'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Replacement Student Modal */}
      <Modal
        isOpen={isReplacementModalOpen}
        onClose={() => setIsReplacementModalOpen(false)}
        title="Add Replacement Student to Roll Call"
      >
        <form onSubmit={handleAddReplacement} className="space-y-4">
          <div>
            <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
              Search & Select Student
            </label>
            <input
              type="text"
              value={replacementSearch}
              onChange={(e) => setReplacementSearch(e.target.value)}
              placeholder="Search by name or ID..."
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white mb-2"
            />

            <div className="max-h-48 overflow-y-auto space-y-1.5 border-2 border-slate-900 dark:border-neutral-700 p-2 rounded-xl bg-slate-50 dark:bg-neutral-800">
              {candidateStudents.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-2">No students available</p>
              ) : (
                candidateStudents.map((stu) => (
                  <button
                    key={stu.id}
                    type="button"
                    onClick={() => setSelectedStudentId(stu.id)}
                    className={`w-full text-left p-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${
                      selectedStudentId === stu.id
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'hover:bg-slate-200 dark:hover:bg-neutral-700 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <span>
                      {stu.full_name} ({stu.student_id})
                    </span>
                    {selectedStudentId === stu.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
              Replacement Note / Makeup Reason
            </label>
            <textarea
              rows={2}
              value={replacementNote}
              onChange={(e) => setReplacementNote(e.target.value)}
              placeholder="e.g. Replacing missed class from Saturday 8 August..."
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsReplacementModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-black bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedStudentId || isAddingReplacement}
              className="px-4 py-2 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-40 cursor-pointer"
            >
              {isAddingReplacement ? 'Adding...' : 'Confirm & Mark Present'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
