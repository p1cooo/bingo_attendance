import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../common/Toast.js';
import { api } from '../../lib/api.js';
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
      api.getStudents({ status: 'ACTIVE' }).then(setAllStudents).catch(console.error);
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
        showToast(`✓ ${studentName}: PRESENT (Parent Telegram alert dispatched)`, 'success', 2500);
      } else if (status === 'ABSENT') {
        showToast(`⚠ ${studentName}: ABSENT (Parent notification logged)`, 'info', 2500);
      } else {
        showToast(`✓ ${studentName}: marked ${status}`, 'success', 2000);
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
    attendanceMap.set(rec.student_id, rec);
  });

  interface StudentRollItem {
    student: Student;
    record?: AttendanceRecord;
    isReplacement: boolean;
  }

  const rollList: StudentRollItem[] = [];

  // Add enrolled students
  session.enrolled_students?.forEach((stu) => {
    const record = attendanceMap.get(stu.id);
    rollList.push({
      student: stu,
      record,
      isReplacement: record?.attendance_type === 'REPLACEMENT',
    });
  });

  // Add replacement students who are in attendance_records but not in enrolled_students
  session.attendance_records?.forEach((rec) => {
    if (rec.attendance_type === 'REPLACEMENT' && !rollList.some((r) => r.student.id === rec.student_id)) {
      if (rec.student) {
        rollList.push({
          student: rec.student,
          record: rec,
          isReplacement: true,
        });
      }
    }
  });

  // Filter roll by search query
  const filteredRoll = rollList.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      item.student.full_name.toLowerCase().includes(q) ||
      item.student.student_id.toLowerCase().includes(q) ||
      (item.student.nick_name && item.student.nick_name.toLowerCase().includes(q))
    );
  });

  // Stats calculation
  const totalStudents = rollList.length;
  const presentCount = rollList.filter(
    (item) => item.record?.status === 'PRESENT' || item.record?.status === 'LATE'
  ).length;
  const absentCount = rollList.filter((item) => item.record?.status === 'ABSENT').length;
  const unmarkedCount = rollList.filter((item) => !item.record).length;

  const isReplacementCoach = session.scheduled_coach_id !== session.actual_coach_id;
  const coachColor = session.actual_coach?.color || '#3b82f6';

  // Filter candidate students for replacement modal
  const existingStudentIds = new Set(rollList.map((r) => r.student.id));
  const candidateStudents = allStudents
    .filter((s) => !existingStudentIds.has(s.id))
    .filter((s) => {
      if (!replacementSearch) return true;
      const q = replacementSearch.toLowerCase().trim();
      return (
        s.full_name.toLowerCase().includes(q) ||
        s.student_id.toLowerCase().includes(q) ||
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
            className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-black text-slate-900 dark:text-white bg-slate-100 dark:bg-neutral-800 border border-slate-300 dark:border-neutral-700 hover:bg-slate-200 transition-colors"
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
              Coach {session.actual_coach?.name || user?.name}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {session.class_item?.name || 'Group Training'}
              </h2>
              {isReplacementCoach && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200">
                  Replacement Coach
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {session.session_date} ({session.start_time} – {session.end_time})
              </span>
              {session.room_location && <span>• Room: {session.room_location}</span>}
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

      {/* Action Bar: Search & Add Replacement Student */}
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
          id="add-replacement-student-btn"
          onClick={() => setIsReplacementModalOpen(true)}
          className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl text-xs font-black bg-white dark:bg-neutral-900 hover:bg-slate-50 dark:hover:bg-neutral-800 text-slate-900 dark:text-white border-2 border-slate-900 dark:border-neutral-700 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.06)] transition-all active:translate-x-0.5 active:translate-y-0.5 flex-shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Add Replacement Student</span>
        </button>
      </div>

      {/* Telegram Live Gateway Indicator Banner */}
      <div className="bg-[#f0fdf4] dark:bg-emerald-950/20 border-2 border-slate-900 dark:border-emerald-800 rounded-2xl p-3 flex items-center justify-between gap-3 text-xs shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.04)]">
        <div className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-300">
          <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <span>Automated Telegram Parent Gateway: Connected & Active</span>
        </div>
        <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-300">
          Live Dispatch
        </span>
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
          filteredRoll.map(({ student, record, isReplacement }) => {
            const status = record?.status;
            const isSaving = savingStudentId === student.id;

            return (
              <div
                key={student.id}
                className={`p-4 sm:p-5 rounded-3xl border-2 border-slate-900 dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] transition-all ${
                  status === 'PRESENT'
                    ? 'bg-[#ecfdf5] dark:bg-emerald-950/20'
                    : status === 'ABSENT'
                    ? 'bg-[#fff1f2] dark:bg-rose-950/20'
                    : status === 'LATE'
                    ? 'bg-[#fffbeb] dark:bg-amber-950/20'
                    : status === 'EXCUSED'
                    ? 'bg-[#faf5ff] dark:bg-purple-950/20'
                    : 'bg-white dark:bg-neutral-900'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Student Details */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-xs flex items-center justify-center border-2 border-slate-900 flex-shrink-0">
                      {student.full_name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .substring(0, 2)}
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                          {student.full_name}
                        </h4>
                        {student.nick_name && (
                          <span className="text-xs font-bold text-slate-500">
                            ({student.nick_name})
                          </span>
                        )}
                        {isReplacement && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 border border-blue-300">
                            Replacement
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 text-xs text-slate-500 font-bold flex-wrap">
                        <span className="font-mono">{student.student_id}</span>
                        {student.school && <span>• {student.school}</span>}
                        {student.parent?.telegram_username && (
                          <span className="text-sky-600 dark:text-sky-400 font-semibold">
                            Telegram: {student.parent.telegram_username}
                          </span>
                        )}
                      </div>

                      {record?.replacement_note && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 font-bold italic mt-1">
                          Note: {record.replacement_note}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 4 Direct 1-Tap Attendance Actions */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center flex-wrap">
                    {/* PRESENT */}
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        handleMarkStatus(
                          student.id,
                          student.full_name,
                          'PRESENT',
                          isReplacement ? 'REPLACEMENT' : 'REGULAR'
                        )
                      }
                      className={`h-9 px-3.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all border-2 border-slate-900 ${
                        status === 'PRESENT'
                          ? 'bg-emerald-600 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] scale-105'
                          : 'bg-white hover:bg-emerald-50 text-slate-900 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Present</span>
                    </button>

                    {/* ABSENT */}
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        handleMarkStatus(
                          student.id,
                          student.full_name,
                          'ABSENT',
                          isReplacement ? 'REPLACEMENT' : 'REGULAR'
                        )
                      }
                      className={`h-9 px-3 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all border-2 border-slate-900 ${
                        status === 'ABSENT'
                          ? 'bg-rose-600 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] scale-105'
                          : 'bg-white hover:bg-rose-50 text-slate-900 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700'
                      }`}
                    >
                      <X className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Absent</span>
                    </button>

                    {/* LATE */}
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        handleMarkStatus(
                          student.id,
                          student.full_name,
                          'LATE',
                          isReplacement ? 'REPLACEMENT' : 'REGULAR'
                        )
                      }
                      className={`h-9 px-2.5 rounded-xl text-xs font-black transition-all border-2 border-slate-900 ${
                        status === 'LATE'
                          ? 'bg-amber-500 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] scale-105'
                          : 'bg-white hover:bg-amber-50 text-slate-900 dark:bg-neutral-800 dark:text-white'
                      }`}
                    >
                      <span>Late</span>
                    </button>

                    {/* EXCUSED */}
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        handleMarkStatus(
                          student.id,
                          student.full_name,
                          'EXCUSED',
                          isReplacement ? 'REPLACEMENT' : 'REGULAR'
                        )
                      }
                      className={`h-9 px-2.5 rounded-xl text-xs font-black transition-all border-2 border-slate-900 ${
                        status === 'EXCUSED'
                          ? 'bg-purple-600 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] scale-105'
                          : 'bg-white hover:bg-purple-50 text-slate-900 dark:bg-neutral-800 dark:text-white'
                      }`}
                    >
                      <span>Excused</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

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
                    className={`w-full text-left p-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-between ${
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
              className="px-4 py-2 rounded-xl text-xs font-black bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedStudentId || isAddingReplacement}
              className="px-4 py-2 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-40"
            >
              {isAddingReplacement ? 'Adding...' : 'Confirm & Mark Present'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
