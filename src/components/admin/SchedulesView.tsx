import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../common/Toast.js';
import { ClassSchedule, Coach, AcademyClass, Student } from '../../types.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';
import { Modal } from '../common/Modal.js';
import { CoachBadge } from '../common/CoachBadge.js';
import {
  Plus,
  Edit2,
  Users,
  Clock,
  MapPin,
  Search,
  Filter,
  UserPlus,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

interface SchedulesViewProps {
  initialCreateModalOpen?: boolean;
  onCloseInitialCreateModal?: () => void;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const SchedulesView: React.FC<SchedulesViewProps> = ({
  initialCreateModalOpen = false,
  onCloseInitialCreateModal,
}) => {
  const { showToast } = useToast();

  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [classes, setClasses] = useState<AcademyClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Global Filters
  const [search, setSearch] = useState('');
  const [selectedCoachId, setSelectedCoachId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ACTIVE');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(initialCreateModalOpen);
  const [editingSchedule, setEditingSchedule] = useState<ClassSchedule | null>(null);
  const [deletingSchedule, setDeletingSchedule] = useState<ClassSchedule | null>(null);
  const [enrollModalSchedule, setEnrollModalSchedule] = useState<ClassSchedule | null>(null);
  const [studentToEnrollId, setStudentToEnrollId] = useState('');

  const [formData, setFormData] = useState({
    class_id: '',
    coach_id: '',
    day_of_week: 6, // Saturday default
    start_time: '09:30',
    end_time: '11:00',
    room_location: 'Court A1 / Main Studio',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [schedRes, coachRes, classRes, stuRes] = await Promise.all([
        api.getSchedules({
          coach_id: selectedCoachId,
          class_id: selectedClassId,
          day_of_week: selectedDay,
          status: selectedStatus,
          search,
        }),
        api.getCoaches(),
        api.getClasses(),
        api.getStudents(),
      ]);
      setSchedules(schedRes);
      setCoaches(coachRes);
      setClasses(classRes);
      setStudents(stuRes);
    } catch (err: any) {
      showToast(err.message || 'Failed to load schedules', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedCoachId, selectedClassId, selectedDay, selectedStatus]);

  useEffect(() => {
    if (initialCreateModalOpen) {
      setIsModalOpen(true);
    }
  }, [initialCreateModalOpen]);

  const handleOpenAdd = () => {
    setEditingSchedule(null);
    setFormData({
      class_id: classes[0]?.id || '',
      coach_id: coaches[0]?.id || '',
      day_of_week: 6,
      start_time: '09:30',
      end_time: '11:00',
      room_location: 'Court A1 / Main Studio',
      status: 'ACTIVE',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (sched: ClassSchedule) => {
    setEditingSchedule(sched);
    setFormData({
      class_id: sched.class_id,
      coach_id: sched.coach_id,
      day_of_week: sched.day_of_week,
      start_time: sched.start_time,
      end_time: sched.end_time,
      room_location: sched.room_location || 'Main Studio',
      status: sched.status,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.class_id || !formData.coach_id) {
      showToast('Please select both class and coach', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingSchedule) {
        await api.updateSchedule(editingSchedule.id, formData);
        showToast('✓ Recurring schedule updated', 'success');
      } else {
        await api.createSchedule(formData);
        showToast('✓ Recurring schedule created', 'success');
      }
      setIsModalOpen(false);
      if (onCloseInitialCreateModal) onCloseInitialCreateModal();
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to save schedule', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSchedule = async () => {
    if (!deletingSchedule) return;
    try {
      setIsSubmitting(true);
      await api.deleteSchedule(deletingSchedule.id);
      showToast('✓ Schedule deleted successfully', 'success');
      setDeletingSchedule(null);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete schedule', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEnrollStudent = async () => {
    if (!enrollModalSchedule || !studentToEnrollId) return;

    try {
      await api.enrollStudent(enrollModalSchedule.id, studentToEnrollId);
      showToast('✓ Student enrolled in schedule', 'success');
      setStudentToEnrollId('');
      const updated = await api.getSchedules({
        coach_id: selectedCoachId,
        class_id: selectedClassId,
        day_of_week: selectedDay,
        status: selectedStatus,
        search,
      });
      setSchedules(updated);
      // Update modal schedule view
      const freshModalSched = updated.find((s) => s.id === enrollModalSchedule.id);
      if (freshModalSched) setEnrollModalSchedule(freshModalSched);
    } catch (err: any) {
      showToast(err.message || 'Failed to enroll student', 'error');
    }
  };

  const handleUnenrollStudent = async (studentId: string) => {
    if (!enrollModalSchedule) return;

    try {
      await api.unenrollStudent(enrollModalSchedule.id, studentId);
      showToast('Student removed from schedule', 'info');
      const updated = await api.getSchedules({
        coach_id: selectedCoachId,
        class_id: selectedClassId,
        day_of_week: selectedDay,
        status: selectedStatus,
        search,
      });
      setSchedules(updated);
      const freshModalSched = updated.find((s) => s.id === enrollModalSchedule.id);
      if (freshModalSched) setEnrollModalSchedule(freshModalSched);
    } catch (err: any) {
      showToast(err.message || 'Failed to unenroll student', 'error');
    }
  };

  // Group schedules by Coach for clear visual hierarchy
  const coachGroupedMap = new Map<string, { coach: Coach; schedules: ClassSchedule[] }>();

  schedules.forEach((sched) => {
    const c = sched.coach;
    if (!c) return;
    if (!coachGroupedMap.has(c.id)) {
      coachGroupedMap.set(c.id, { coach: c, schedules: [] });
    }
    coachGroupedMap.get(c.id)!.schedules.push(sched);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">
            Recurring Class Schedules
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Manage weekly recurring class timetables, assigned coaches, and student rosters
          </p>
        </div>

        <button
          id="create-schedule-main-btn"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 transition-colors shadow-2xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ Create Schedule</span>
        </button>
      </div>

      {/* Global Filter Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {/* Search */}
          <div className="sm:col-span-1 relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search schedules..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none"
            />
          </div>

          {/* Coach Filter */}
          <div>
            <select
              value={selectedCoachId}
              onChange={(e) => setSelectedCoachId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
            >
              <option value="">All Coaches</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  Coach {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Program Filter */}
          <div>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
            >
              <option value="">All Programs</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>

          {/* Day of Week Filter */}
          <div>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
            >
              <option value="">All Days</option>
              {DAY_NAMES.map((name, idx) => (
                <option key={idx} value={idx}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active Schedules</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grouped Schedules List */}
      {loading ? (
        <LoadingSkeleton count={4} type="card" />
      ) : coachGroupedMap.size === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-neutral-500">
          No recurring schedules found matching your filters.
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(coachGroupedMap.values()).map(({ coach, schedules: coachSchedules }) => (
            <div
              key={coach.id}
              className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xs overflow-hidden"
            >
              {/* Coach Group Header */}
              <div className="p-4 bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: coach.color }}
                  />
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                    Coach {coach.name}
                  </h3>
                  <span className="text-xs text-neutral-400">
                    ({coachSchedules.length} schedules)
                  </span>
                </div>
              </div>

              {/* Schedules in this group */}
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {coachSchedules.map((sched) => {
                  const dayName = DAY_NAMES[sched.day_of_week];
                  return (
                    <div
                      key={sched.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {/* Pastel Coach Indicator */}
                        <div
                          className="w-1 self-stretch rounded-full flex-shrink-0"
                          style={{ backgroundColor: coach.color }}
                        />

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-neutral-900 dark:text-white">
                              ● {dayName} {sched.start_time} – {sched.end_time}
                            </span>
                            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                              {sched.class_item?.name}
                            </span>
                          </div>

                          <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                            {sched.room_location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-neutral-400" />
                                <span>{sched.room_location}</span>
                              </span>
                            )}
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3 text-neutral-400" />
                              <span>{sched.enrolled_students_count || 0} students enrolled</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center">
                        <button
                          onClick={() => setEnrollModalSchedule(sched)}
                          className="py-1 px-2.5 rounded-lg text-xs font-medium bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Roster ({sched.enrolled_students_count || 0})</span>
                        </button>
                        <button
                          onClick={() => handleOpenEdit(sched)}
                          title="Edit Schedule"
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingSchedule(sched)}
                          title="Delete Schedule"
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Schedule Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          if (onCloseInitialCreateModal) onCloseInitialCreateModal();
        }}
        title={editingSchedule ? 'Edit Recurring Schedule' : 'Create Recurring Schedule'}
        subtitle="Set up recurring weekly class arrangements and assigned primary coach."
        maxWidth="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Class Program *
            </label>
            <select
              required
              value={formData.class_id}
              onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
            >
              <option value="">Select Program</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.class_type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Assigned Coach *
            </label>
            <select
              required
              value={formData.coach_id}
              onChange={(e) => setFormData({ ...formData, coach_id: e.target.value })}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
            >
              <option value="">Select Coach</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  Coach {c.name} ({c.color_name})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Day of Week
              </label>
              <select
                value={formData.day_of_week}
                onChange={(e) => setFormData({ ...formData, day_of_week: Number(e.target.value) })}
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
              >
                {DAY_NAMES.map((name, idx) => (
                  <option key={idx} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Start Time
              </label>
              <input
                type="text"
                required
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                placeholder="09:30"
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                End Time
              </label>
              <input
                type="text"
                required
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                placeholder="11:00"
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Room / Board Location
            </label>
            <input
              type="text"
              value={formData.room_location}
              onChange={(e) => setFormData({ ...formData, room_location: e.target.value })}
              placeholder="e.g. Chess Hall A - Board 1-4"
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                if (onCloseInitialCreateModal) onCloseInitialCreateModal();
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
              {isSubmitting ? 'Saving...' : editingSchedule ? 'Save Changes' : 'Create Schedule'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Schedule Confirmation Modal */}
      <Modal
        isOpen={!!deletingSchedule}
        onClose={() => setDeletingSchedule(null)}
        title="Delete Recurring Schedule"
        subtitle="Are you sure you want to delete this class schedule?"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-rose-800 dark:text-rose-300">
              <span className="font-semibold">
                {deletingSchedule && DAY_NAMES[deletingSchedule.day_of_week]} {deletingSchedule?.start_time} - {deletingSchedule?.end_time} ({deletingSchedule?.class_item?.name})
              </span>{' '}
              will be permanently removed.
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeletingSchedule(null)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleDeleteSchedule}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Manage Roster / Enrolled Students Modal */}
      <Modal
        isOpen={!!enrollModalSchedule}
        onClose={() => setEnrollModalSchedule(null)}
        title={
          enrollModalSchedule
            ? `Roster: ${DAY_NAMES[enrollModalSchedule.day_of_week]} ${enrollModalSchedule.start_time} ${enrollModalSchedule.class_item?.name}`
            : 'Roster'
        }
        subtitle="Enrolled students who are expected in this weekly recurring schedule."
        maxWidth="lg"
      >
        {enrollModalSchedule && (
          <div className="space-y-4">
            {/* Add Student to Schedule Form */}
            <div className="flex items-center gap-2">
              <select
                value={studentToEnrollId}
                onChange={(e) => setStudentToEnrollId(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none"
              >
                <option value="">Select student to add...</option>
                {students
                  .filter(
                    (s) => !enrollModalSchedule.enrolled_student_ids?.includes(s.id)
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.student_id})
                    </option>
                  ))}
              </select>

              <button
                type="button"
                onClick={handleEnrollStudent}
                disabled={!studentToEnrollId}
                className="py-1.5 px-3 rounded-xl text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-colors"
              >
                Enroll
              </button>
            </div>

            {/* List of currently enrolled students */}
            <div className="max-h-56 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-xl divide-y divide-neutral-100 dark:divide-neutral-800">
              {enrollModalSchedule.enrolled_student_ids &&
              enrollModalSchedule.enrolled_student_ids.length > 0 ? (
                enrollModalSchedule.enrolled_student_ids.map((stuId) => {
                  const studentObj = students.find((s) => s.id === stuId);
                  return (
                    <div
                      key={stuId}
                      className="p-3 flex items-center justify-between text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                    >
                      <div>
                        <span className="font-semibold text-neutral-900 dark:text-white">
                          {studentObj?.full_name || 'Student'}
                        </span>
                        <span className="text-neutral-400 ml-2">
                          {studentObj?.student_id}
                        </span>
                      </div>

                      <button
                        onClick={() => handleUnenrollStudent(stuId)}
                        className="p-1 rounded text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Remove student from schedule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="p-4 text-center text-xs text-neutral-400">
                  No students currently enrolled in this schedule.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
