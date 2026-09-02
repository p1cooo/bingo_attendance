import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../common/Toast.js';
import { Student, Coach, AcademyClass, ClassSchedule } from '../../types.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';
import { Modal } from '../common/Modal.js';
import { CoachBadge } from '../common/CoachBadge.js';
import {
  Search,
  Plus,
  User,
  Phone,
  Send,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Edit2,
  Eye,
  Trash2,
  AlertTriangle,
  FileSpreadsheet,
} from 'lucide-react';
import { BulkAddStudentsModal } from './BulkAddStudentsModal.js';

interface StudentsViewProps {
  initialAddModalOpen?: boolean;
  onCloseInitialAddModal?: () => void;
}

export const StudentsView: React.FC<StudentsViewProps> = ({
  initialAddModalOpen = false,
  onCloseInitialAddModal,
}) => {
  const { showToast } = useToast();

  const [students, setStudents] = useState<Student[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [classes, setClasses] = useState<AcademyClass[]>([]);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCoachId, setSelectedCoachId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ACTIVE');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(initialAddModalOpen);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [profileStudent, setProfileStudent] = useState<(Student & { attendance_history?: any[] }) | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    student_id: '',
    full_name: '',
    nick_name: '',
    school: '',
    parent_name: '',
    parent_phone: '',
    parent_email: '',
    parent_relation: 'Parent',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
    schedule_ids: [] as string[],
  });

  // Modal Class Schedule Filters
  const [modalDayFilter, setModalDayFilter] = useState('');
  const [modalCoachFilter, setModalCoachFilter] = useState('');
  const [modalSearch, setModalSearch] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [stuRes, coachRes, classRes, schedRes] = await Promise.all([
        api.getStudents({
          search,
          coach_id: selectedCoachId,
          class_id: selectedClassId,
          status: selectedStatus,
        }),
        api.getCoaches(),
        api.getClasses(),
        api.getSchedules(),
      ]);
      setStudents(stuRes);
      setCoaches(coachRes);
      setClasses(classRes);
      setSchedules(schedRes);
    } catch (err: any) {
      showToast(err.message || 'Failed to load students', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedCoachId, selectedClassId, selectedStatus]);

  useEffect(() => {
    if (initialAddModalOpen) {
      setIsAddModalOpen(true);
    }
  }, [initialAddModalOpen]);

  const handleOpenAdd = () => {
    setFormData({
      student_id: '',
      full_name: '',
      nick_name: '',
      school: '',
      parent_name: '',
      parent_phone: '',
      parent_email: '',
      parent_relation: 'Parent',
      status: 'ACTIVE',
      schedule_ids: [],
    });
    setModalDayFilter('');
    setModalCoachFilter('');
    setModalSearch('');
    setEditingStudent(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      student_id: student.student_id,
      full_name: student.full_name,
      nick_name: student.nick_name || '',
      school: student.school || '',
      parent_name: student.parent?.name || '',
      parent_phone: student.parent?.phone || '',
      parent_email: student.parent?.email || '',
      parent_relation: student.parent_relation || 'Parent',
      status: student.status,
      schedule_ids: student.enrolled_schedules?.map((s) => s.schedule_id) || [],
    });
    setModalDayFilter('');
    setModalCoachFilter('');
    setModalSearch('');
    setIsAddModalOpen(true);
  };

  const handleOpenProfile = async (studentId: string) => {
    try {
      const detailed = await api.getStudent(studentId);
      setProfileStudent(detailed);
    } catch (err: any) {
      showToast(err.message || 'Failed to load student profile', 'error');
    }
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      showToast('Student name is required', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingStudent) {
        await api.updateStudent(editingStudent.id, formData);
        showToast('✓ Student updated successfully', 'success');
      } else {
        await api.createStudent(formData);
        showToast('✓ Student registered successfully', 'success');
      }
      setIsAddModalOpen(false);
      if (onCloseInitialAddModal) onCloseInitialAddModal();
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to save student', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!deletingStudent) return;
    try {
      setIsSubmitting(true);
      await api.deleteStudent(deletingStudent.id);
      showToast(`✓ Student "${deletingStudent.full_name}" deleted`, 'success');
      setDeletingStudent(null);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete student', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleScheduleEnrollment = (schedId: string) => {
    setFormData((prev) => {
      const exists = prev.schedule_ids.includes(schedId);
      return {
        ...prev,
        schedule_ids: exists
          ? prev.schedule_ids.filter((id) => id !== schedId)
          : [...prev.schedule_ids, schedId],
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Title & Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Students Directory
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-neutral-700">
              {students.length} Enrolled
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage student records, parent contact details, and class enrollments
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            id="bulk-add-students-btn"
            type="button"
            onClick={() => setIsBulkModalOpen(true)}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-semibold bg-white dark:bg-neutral-800 text-slate-800 dark:text-slate-200 border-2 border-slate-200 dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-700/60 transition-colors shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Bulk Add Students</span>
          </button>

          <button
            id="add-student-main-btn"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Student</span>
          </button>
        </div>
      </div>

      {/* Filter Bar (Search + Global Class Filtering) */}
      <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border-2 border-slate-900/10 dark:border-neutral-800 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Search by Name or ID */}
          <div className="sm:col-span-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              id="student-search-input"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or ID..."
              className="w-full pl-9 pr-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white"
            />
          </div>

          {/* Filter Coach */}
          <div>
            <select
              id="student-filter-coach"
              value={selectedCoachId}
              onChange={(e) => setSelectedCoachId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="">All Coaches</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  Coach {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Class */}
          <div>
            <select
              id="student-filter-class"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="">All Classes</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Status */}
          <div>
            <select
              id="student-filter-status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active Students</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-3xl border-2 border-slate-900 dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] overflow-hidden">
        {loading ? (
          <div className="p-6">
            <LoadingSkeleton count={5} type="row" />
          </div>
        ) : students.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-neutral-800 text-slate-400 mx-auto flex items-center justify-center">
              <User className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">No students found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No student records matched your current search or filter criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white dark:bg-neutral-800 border-b border-slate-800 dark:border-neutral-700">
                <tr>
                  <th className="py-3 px-4 font-black uppercase text-[10px]">Student</th>
                  <th className="py-3 px-4 font-black uppercase text-[10px]">ID / School</th>
                  <th className="py-3 px-4 font-black uppercase text-[10px]">Parent / Contact</th>
                  <th className="py-3 px-4 font-black uppercase text-[10px]">Enrolled Classes</th>
                  <th className="py-3 px-4 font-black uppercase text-[10px] text-center">Attendance Rate</th>
                  <th className="py-3 px-4 font-black uppercase text-[10px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                {students.map((stu) => {
                  const rate = stu.attendance_summary?.rate_percent ?? 100;
                  return (
                    <tr
                      key={stu.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-neutral-800/40 transition-colors"
                    >
                      {/* Name */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {stu.full_name}
                        </div>
                        {stu.nick_name && (
                          <div className="text-[11px] text-slate-400 font-medium">
                            aka {stu.nick_name}
                          </div>
                        )}
                      </td>

                      {/* ID & School */}
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-neutral-200">
                          {stu.student_id}
                        </span>
                        <div className="text-[11px] text-slate-500 truncate max-w-[140px]">
                          {stu.school || '—'}
                        </div>
                      </td>

                      {/* Parent / Contact */}
                      <td className="py-3 px-4">
                        {stu.parent ? (
                          <div>
                            <span className="font-bold text-slate-800 dark:text-neutral-200">
                              {stu.parent.name}
                            </span>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5 font-medium">
                              <span>{stu.parent.phone || 'No phone'}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Enrolled Classes (Multiple Memberships) */}
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {stu.enrolled_schedules && stu.enrolled_schedules.length > 0 ? (
                            stu.enrolled_schedules.map((sch) => (
                              <span
                                key={sch.schedule_id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 border border-slate-200 dark:border-neutral-700"
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: sch.coach_color }}
                                />
                                {sch.class_name}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 text-[11px]">None</span>
                          )}
                        </div>
                      </td>

                      {/* Attendance Rate */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black border ${
                            rate >= 80
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                          }`}
                        >
                          {rate}% ({stu.attendance_summary?.present_count || 0}/{stu.attendance_summary?.total_sessions || 0})
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenProfile(stu.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                            title="View Profile & Attendance History"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(stu)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                            title="Edit Student"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingStudent(stu)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Delete Student"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Student Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          if (onCloseInitialAddModal) onCloseInitialAddModal();
        }}
        title={editingStudent ? 'Edit Student Details' : 'Register New Student'}
        subtitle="Manage student identification, guardian details, and recurring class assignments."
        maxWidth="xl"
      >
        <form onSubmit={handleSaveStudent} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="e.g. John Tan"
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Nickname
              </label>
              <input
                type="text"
                value={formData.nick_name}
                onChange={(e) => setFormData({ ...formData, nick_name: e.target.value })}
                placeholder="e.g. Johnny"
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Student ID (Optional / Auto)
              </label>
              <input
                type="text"
                value={formData.student_id}
                onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                placeholder="e.g. STU-0101"
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                School
              </label>
              <input
                type="text"
                value={formData.school}
                onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                placeholder="e.g. St Joseph Academy"
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
              />
            </div>
          </div>

          {/* Parent/Guardian Section */}
          <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <h4 className="text-xs font-semibold text-neutral-900 dark:text-white mb-2">
              Parent / Guardian Information (For Notifications)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                  Guardian Name
                </label>
                <input
                  type="text"
                  value={formData.parent_name}
                  onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
                  placeholder="e.g. David Tan"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                  Parent Phone (WhatsApp Notifications)
                </label>
                <input
                  type="text"
                  value={formData.parent_phone}
                  onChange={(e) => setFormData({ ...formData, parent_phone: e.target.value })}
                  placeholder="+60 12-345 6789"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                  Parent Email (Optional)
                </label>
                <input
                  type="email"
                  value={formData.parent_email}
                  onChange={(e) => setFormData({ ...formData, parent_email: e.target.value })}
                  placeholder="parent@example.com"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                  Relation
                </label>
                <input
                  type="text"
                  value={formData.parent_relation}
                  onChange={(e) => setFormData({ ...formData, parent_relation: e.target.value })}
                  placeholder="Father / Mother / Guardian"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Enrolled Class Schedules (Supports Multiple Memberships) */}
          <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
              <div>
                <h4 className="text-xs font-semibold text-neutral-900 dark:text-white">
                  Class Schedule Memberships (Select all applicable)
                </h4>
                <p className="text-[11px] text-neutral-400">
                  A student can belong to multiple weekly schedules across different coaches.
                </p>
              </div>
              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                  Selected: {formData.schedule_ids.length} {formData.schedule_ids.length === 1 ? 'class' : 'classes'}
                </span>
              </div>
            </div>

            {/* Schedule Filter Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 mb-2">
              {/* Day Filter */}
              <div className="sm:col-span-4">
                <select
                  id="modal-schedule-filter-day"
                  value={modalDayFilter}
                  onChange={(e) => setModalDayFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                >
                  <option value="">All Days</option>
                  <option value="1">Monday</option>
                  <option value="2">Tuesday</option>
                  <option value="3">Wednesday</option>
                  <option value="4">Thursday</option>
                  <option value="5">Friday</option>
                  <option value="6">Saturday</option>
                  <option value="0">Sunday</option>
                </select>
              </div>

              {/* Coach Filter */}
              <div className="sm:col-span-4">
                <select
                  id="modal-schedule-filter-coach"
                  value={modalCoachFilter}
                  onChange={(e) => setModalCoachFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                >
                  <option value="">All Coaches</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      Coach {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search Filter */}
              <div className="sm:col-span-4 relative">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  id="modal-schedule-search-input"
                  type="text"
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  placeholder="Search schedule..."
                  className="w-full pl-8 pr-6 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                />
                {modalSearch && (
                  <button
                    type="button"
                    onClick={() => setModalSearch('')}
                    className="absolute right-2 top-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-xs font-bold leading-none p-0.5"
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Filtered Schedules List */}
            {(() => {
              const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

              const filteredModalSchedules = schedules.filter((sch) => {
                // Day filter
                if (modalDayFilter !== '' && sch.day_of_week !== Number(modalDayFilter)) {
                  return false;
                }

                // Coach filter
                if (modalCoachFilter !== '') {
                  const coachId = sch.coach_id || sch.coach?.id || sch.default_coach_id;
                  if (coachId !== modalCoachFilter) {
                    return false;
                  }
                }

                // Search query filter
                if (modalSearch.trim()) {
                  const q = modalSearch.trim().toLowerCase();
                  const dayFull = DAY_NAMES_FULL[sch.day_of_week]?.toLowerCase() || '';
                  const dayShort = DAY_NAMES_SHORT[sch.day_of_week]?.toLowerCase() || '';
                  const coachName = (sch.coach?.name || '').toLowerCase();
                  const className = (sch.class_item?.name || '').toLowerCase();
                  const timeStr = `${sch.start_time} ${sch.end_time} ${sch.start_time}-${sch.end_time} ${sch.start_time}–${sch.end_time}`.toLowerCase();
                  const roomStr = (sch.room_location || '').toLowerCase();

                  const matches =
                    dayFull.includes(q) ||
                    dayShort.includes(q) ||
                    coachName.includes(q) ||
                    className.includes(q) ||
                    timeStr.includes(q) ||
                    roomStr.includes(q);

                  if (!matches) return false;
                }

                return true;
              });

              if (filteredModalSchedules.length === 0) {
                return (
                  <div className="py-6 px-4 text-center rounded-xl border border-dashed border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                      No class schedules match your filters.
                    </p>
                    {(modalDayFilter || modalCoachFilter || modalSearch) && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalDayFilter('');
                          setModalCoachFilter('');
                          setModalSearch('');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-medium rounded-lg text-neutral-700 dark:text-neutral-300 bg-neutral-200/80 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors cursor-pointer"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div className="max-h-48 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-xl divide-y divide-neutral-100 dark:divide-neutral-800 p-1">
                  {filteredModalSchedules.map((sch) => {
                    const isChecked = formData.schedule_ids.includes(sch.id);
                    const dayName = DAY_NAMES_SHORT[sch.day_of_week] || 'Day';
                    const enrolledCount = sch.enrolled_students_count ?? sch.enrolled_students?.length ?? 0;
                    const capacity = sch.class_item?.default_capacity;
                    const hasCapacity = typeof capacity === 'number' && capacity > 0;
                    const isFull = hasCapacity && enrolledCount >= capacity;
                    const isAlmostFull = hasCapacity && !isFull && enrolledCount >= Math.ceil(capacity * 0.8);
                    const isSelectionDisabled = isFull && !isChecked;

                    return (
                      <label
                        key={sch.id}
                        className={`flex items-center justify-between p-2 rounded-lg transition-colors text-xs select-none ${
                          isSelectionDisabled
                            ? 'opacity-60 bg-neutral-50/70 dark:bg-neutral-800/30 cursor-not-allowed border border-dashed border-rose-200 dark:border-rose-900/40'
                            : isChecked
                            ? 'bg-neutral-100 dark:bg-neutral-800 font-medium cursor-pointer border border-neutral-200 dark:border-neutral-700'
                            : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer border border-transparent'
                        }`}
                        title={isSelectionDisabled ? 'Class is at full capacity' : undefined}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isSelectionDisabled}
                            onChange={() => toggleScheduleEnrollment(sch.id)}
                            className="rounded text-neutral-900 disabled:cursor-not-allowed cursor-pointer"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-neutral-900 dark:text-white">
                                {dayName} {sch.start_time}–{sch.end_time}
                              </span>
                              <span className="text-neutral-500 dark:text-neutral-400 truncate">
                                · {sch.class_item?.name}
                              </span>
                            </div>
                            <div className="text-[11px] text-neutral-400 dark:text-neutral-500 flex items-center gap-2 mt-0.5">
                              <span>Coach {sch.coach?.name || 'Unassigned'}</span>
                              {sch.room_location && <span>· Venue: {sch.room_location}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          {/* Capacity Indicator */}
                          {hasCapacity && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                isFull
                                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                  : isAlmostFull
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              }`}
                              title={`${enrolledCount} / ${capacity} enrolled students`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isFull ? 'bg-rose-500' : isAlmostFull ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                              />
                              {isFull ? (
                                <span>{enrolledCount}/{capacity} Full</span>
                              ) : (
                                <span>{enrolledCount}/{capacity} students</span>
                              )}
                            </span>
                          )}

                          <CoachBadge coach={sch.coach} size="sm" variant="dot" />
                        </div>
                      </label>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => {
                setIsAddModalOpen(false);
                if (onCloseInitialAddModal) onCloseInitialAddModal();
              }}
              className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Saving...' : editingStudent ? 'Save Changes' : 'Register Student'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Student Modal */}
      <Modal
        isOpen={!!deletingStudent}
        onClose={() => setDeletingStudent(null)}
        title="Delete Student Record"
        subtitle="Are you sure you want to delete this student?"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-rose-800 dark:text-rose-300">
              <span className="font-semibold">{deletingStudent?.full_name}</span> ({deletingStudent?.student_id}) will be removed from all enrolled schedules and attendance records.
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeletingStudent(null)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleDeleteStudent}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Student Profile & Attendance History Modal */}
      <Modal
        isOpen={!!profileStudent}
        onClose={() => setProfileStudent(null)}
        title={profileStudent ? `${profileStudent.full_name} (${profileStudent.student_id})` : 'Student Profile'}
        subtitle="Student attendance record, guardian details, and enrolled classes."
        maxWidth="2xl"
      >
        {profileStudent && (
          <div className="space-y-5">
            {/* Header info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 text-xs">
              <div>
                <span className="text-neutral-400 block text-[10px]">School</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {profileStudent.school || 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px]">Guardian</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {profileStudent.parent?.name || '—'} ({profileStudent.parent_relation || 'Parent'})
                </span>
                {profileStudent.parent?.email && (
                  <div className="text-[11px] text-neutral-400">{profileStudent.parent.email}</div>
                )}
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px]">WhatsApp Phone Contact</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400 font-mono">
                  {profileStudent.parent?.phone || 'Not configured'}
                </span>
              </div>
            </div>

            {/* Attendance Summary */}
            <div>
              <h4 className="text-xs font-semibold text-neutral-900 dark:text-white mb-2">
                Attendance Summary
              </h4>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                  <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300 block">
                    Present
                  </span>
                  <span className="text-lg font-bold text-emerald-800 dark:text-emerald-200">
                    {profileStudent.attendance_summary?.present_count || 0}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                  <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 block">
                    Replacements
                  </span>
                  <span className="text-lg font-bold text-amber-800 dark:text-amber-200">
                    {profileStudent.attendance_summary?.replacement_count || 0}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                  <span className="text-[10px] font-medium text-neutral-500 block">
                    Overall Rate
                  </span>
                  <span className="text-lg font-bold text-neutral-900 dark:text-white">
                    {profileStudent.attendance_summary?.rate_percent || 100}%
                  </span>
                </div>
              </div>
            </div>

            {/* Attendance History Table */}
            <div>
              <h4 className="text-xs font-semibold text-neutral-900 dark:text-white mb-2">
                Recent Attendance Records
              </h4>
              <div className="max-h-56 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-xl divide-y divide-neutral-100 dark:divide-neutral-800">
                {profileStudent.attendance_history && profileStudent.attendance_history.length > 0 ? (
                  profileStudent.attendance_history.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-3 flex items-center justify-between text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-neutral-900 dark:text-white">
                            {rec.session_date} ({rec.start_time})
                          </span>
                          <span className="text-neutral-500">• {rec.class_name}</span>
                          {rec.attendance_type === 'REPLACEMENT' && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                              Replacement
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-neutral-400">
                          Coach {rec.coach_name}
                        </span>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          rec.status === 'PRESENT'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : rec.status === 'ABSENT'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {rec.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="p-4 text-center text-xs text-neutral-400">
                    No historical attendance recorded yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk Add Students Modal */}
      <BulkAddStudentsModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onSuccess={() => {
          setIsBulkModalOpen(false);
          loadData();
        }}
        existingStudents={students}
        availableSchedules={schedules}
      />
    </div>
  );
};
