import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../common/Toast.js';
import { AcademyClass, ClassType, Coach, Student, ClassSchedule } from '../../types.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';
import { Modal } from '../common/Modal.js';
import { CoachBadge } from '../common/CoachBadge.js';
import {
  Plus,
  Edit2,
  Users,
  Clock,
  Trash2,
  CheckCircle2,
  Calendar,
  MapPin,
  Search,
  Filter,
  UserCheck,
  RotateCcw,
  Sparkles,
  ChevronRight,
  ShieldAlert,
  CalendarDays,
  BookOpen,
  LayoutGrid,
  List,
  Download,
} from 'lucide-react';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface ClassesAndSchedulesViewProps {
  initialViewMode?: 'CLASSES' | 'SCHEDULES';
  initialCreateModalOpen?: boolean;
  onCloseInitialCreateModal?: () => void;
}

export const ClassesAndSchedulesView: React.FC<ClassesAndSchedulesViewProps> = ({
  initialViewMode = 'CLASSES',
  initialCreateModalOpen = false,
  onCloseInitialCreateModal,
}) => {
  const { showToast } = useToast();

  const [viewMode, setViewMode] = useState<'CLASSES' | 'SCHEDULES'>(initialViewMode);
  const [classes, setClasses] = useState<AcademyClass[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCoachId, setFilterCoachId] = useState('');
  const [filterClassType, setFilterClassType] = useState('');
  const [filterDay, setFilterDay] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(initialCreateModalOpen);
  const [isRosterModalOpen, setIsRosterModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<AcademyClass | null>(null);
  const [rosterClass, setRosterClass] = useState<AcademyClass | null>(null);
  const [deletingClass, setDeletingClass] = useState<AcademyClass | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    class_type: 'GROUP' as ClassType,
    day_of_week: 6, // Default Saturday
    start_time: '09:30',
    end_time: '11:00',
    default_coach_id: 'coach-1',
    room_location: 'Chess Hall A',
    description: '',
    default_duration_mins: 90,
    default_capacity: 8,
    is_active: true,
    student_ids: [] as string[],
  });

  const [rosterStudentSearch, setRosterStudentSearch] = useState('');
  const [selectedRosterStudentIds, setSelectedRosterStudentIds] = useState<string[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [classesData, coachesData, studentsData] = await Promise.all([
        api.getClasses({
          search: searchQuery,
          coach_id: filterCoachId,
          class_type: filterClassType,
          day_of_week: filterDay,
          status: filterStatus,
        }),
        api.getCoaches(),
        api.getStudents(),
      ]);
      setClasses(classesData);
      setCoaches(coachesData);
      setStudents(studentsData);
    } catch (err: any) {
      showToast(err.message || 'Failed to load classes and schedules data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [searchQuery, filterCoachId, filterClassType, filterDay, filterStatus]);

  useEffect(() => {
    if (initialCreateModalOpen) {
      setIsModalOpen(true);
    }
  }, [initialCreateModalOpen]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterCoachId('');
    setFilterClassType('');
    setFilterDay('');
    setFilterStatus('');
  };

  const handleOpenAdd = () => {
    setEditingClass(null);
    setFormData({
      name: '',
      class_type: 'GROUP',
      day_of_week: 6,
      start_time: '09:30',
      end_time: '11:00',
      default_coach_id: coaches[0]?.id || 'coach-1',
      room_location: 'Chess Hall A',
      description: '',
      default_duration_mins: 90,
      default_capacity: 8,
      is_active: true,
      student_ids: [],
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cls: AcademyClass) => {
    setEditingClass(cls);
    setFormData({
      name: cls.name,
      class_type: cls.class_type,
      day_of_week: cls.day_of_week ?? 6,
      start_time: cls.start_time || '09:30',
      end_time: cls.end_time || '11:00',
      default_coach_id: cls.default_coach_id || coaches[0]?.id || 'coach-1',
      room_location: cls.room_location || 'Chess Hall A',
      description: cls.description || '',
      default_duration_mins: cls.default_duration_mins || 90,
      default_capacity: cls.default_capacity || 8,
      is_active: cls.is_active,
      student_ids: cls.enrolled_student_ids || [],
    });
    setIsModalOpen(true);
  };

  const handleOpenRoster = (cls: AcademyClass) => {
    setRosterClass(cls);
    setSelectedRosterStudentIds(cls.enrolled_student_ids || []);
    setRosterStudentSearch('');
    setIsRosterModalOpen(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Class title is required', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingClass) {
        await api.updateClass(editingClass.id, formData);
        showToast('✓ Class definition updated successfully', 'success');
      } else {
        await api.createClass(formData);
        showToast('✓ New recurring class created and timetable updated', 'success');
      }

      setIsModalOpen(false);
      if (onCloseInitialCreateModal) onCloseInitialCreateModal();
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to save class', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveRoster = async () => {
    if (!rosterClass) return;
    setIsSubmitting(true);
    try {
      await api.updateClassRoster(rosterClass.id, selectedRosterStudentIds);
      showToast(`✓ Roster updated (${selectedRosterStudentIds.length} students enrolled)`, 'success');
      setIsRosterModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update roster', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClass = async () => {
    if (!deletingClass) return;
    setIsSubmitting(true);
    try {
      await api.deleteClass(deletingClass.id);
      showToast('✓ Class definition removed', 'success');
      setDeletingClass(null);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete class', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportSchedule = async () => {
    try {
      const blob = await api.exportClassSchedulesDocx();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Bingo_Chess_Academy_Schedule.docx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast('✓ Word timetable downloaded', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to export Word timetable', 'error');
    }
  };

  // Group classes by day for the SCHEDULE VIEW
  const scheduleByDay: Record<number, AcademyClass[]> = {
    0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
  };

  classes.forEach((cls) => {
    const day = cls.day_of_week ?? 6;
    if (scheduleByDay[day]) {
      scheduleByDay[day].push(cls);
    }
  });

  // Sort each day by start_time
  Object.keys(scheduleByDay).forEach((k) => {
    const dayNum = Number(k);
    scheduleByDay[dayNum].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  });

  return (
    <div className="space-y-6 pb-8">
      {/* Top Header & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Classes & Schedules
            </h2>
            <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              Permanent Timetable & Rosters
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
            Manage permanent academy class definitions, recurring day/time slots, assigned coaches, and enrolled student rosters
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleExportSchedule}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-2xl text-xs font-black bg-white dark:bg-neutral-900 hover:bg-slate-50 dark:hover:bg-neutral-800 text-slate-900 dark:text-white border-2 border-slate-900 dark:border-neutral-700 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] transition-all active:translate-x-0.5 active:translate-y-0.5"
          >
            <Download className="w-4 h-4" />
            <span>Export Word Timetable</span>
          </button>
          {/* Unified View Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-neutral-800 p-1 rounded-2xl border-2 border-slate-900 dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.06)]">
            <button
              onClick={() => setViewMode('CLASSES')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                viewMode === 'CLASSES'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>CLASS VIEW</span>
            </button>
            <button
              onClick={() => setViewMode('SCHEDULES')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                viewMode === 'SCHEDULES'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>SCHEDULE VIEW</span>
            </button>
          </div>

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-2xl text-xs font-black bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.1)] transition-all active:translate-x-0.5 active:translate-y-0.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create Class</span>
          </button>
        </div>
      </div>

      {/* Filter Bento Bar */}
      <div className="p-4 rounded-3xl bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Search query */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search class or venue..."
              className="w-full pl-9 pr-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
            />
          </div>

          {/* Coach filter */}
          <div>
            <select
              value={filterCoachId}
              onChange={(e) => setFilterCoachId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="">All Default Coaches</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  Coach {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type filter */}
          <div>
            <select
              value={filterClassType}
              onChange={(e) => setFilterClassType(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="">All Types (Group / 1-on-1)</option>
              <option value="GROUP">Group Training</option>
              <option value="INDIVIDUAL">Individual (1-on-1)</option>
            </select>
          </div>

          {/* Day filter */}
          <div>
            <select
              value={filterDay}
              onChange={(e) => setFilterDay(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="">All Days of Week</option>
              {DAYS_OF_WEEK.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reset */}
          <div className="flex items-center">
            <button
              onClick={handleResetFilters}
              className="w-full py-2 px-3 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800 border-2 border-slate-300 dark:border-neutral-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main View Content: CLASS VIEW vs SCHEDULE VIEW */}
      {loading ? (
        <div className="space-y-4">
          <LoadingSkeleton count={4} type="card" />
        </div>
      ) : viewMode === 'CLASSES' ? (
        /* ============================================================ */
        /* 1. CLASS VIEW: "What permanent classes exist?"                */
        /* ============================================================ */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {classes.length === 0 ? (
            <div className="col-span-full p-8 text-center bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
              <p className="text-xs font-bold text-slate-400">No classes match your filter criteria.</p>
            </div>
          ) : (
            classes.map((cls) => {
              const dayName = DAYS_OF_WEEK.find((d) => d.value === cls.day_of_week)?.label || 'Saturday';
              const coachColor = cls.default_coach?.color || '#3b82f6';
              const isGroup = cls.class_type === 'GROUP';

              return (
                <div
                  key={cls.id}
                  className="h-full bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] flex flex-col justify-between relative overflow-hidden transition-all hover:translate-y-[-2px]"
                >
                  <div
                    className="absolute top-0 left-0 right-0 h-2"
                    style={{ backgroundColor: coachColor }}
                  />

                  <div>
                    {/* Top Type & Day Badges */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                            isGroup
                              ? 'bg-sky-50 text-sky-800 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300'
                              : 'bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300'
                          }`}
                        >
                          {isGroup ? 'Group Class' : 'Individual 1-on-1'}
                        </span>
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                          {dayName}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(cls)}
                          className="p-1.5 rounded-xl border border-slate-300 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-600 dark:text-slate-300"
                          title="Edit Class"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingClass(cls)}
                          className="p-1.5 rounded-xl border border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600"
                          title="Delete Class"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                      {cls.name}
                    </h3>

                    {/* Time & Room info */}
                    <div className="mt-2 space-y-1 text-xs font-bold text-slate-600 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {cls.start_time} – {cls.end_time} ({cls.default_duration_mins || 90} mins)
                        </span>
                      </div>
                      {cls.room_location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{cls.room_location}</span>
                        </div>
                      )}
                    </div>

                    {/* Default Coach */}
                    <div className="mt-3.5 p-2.5 rounded-2xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full border border-slate-900"
                          style={{ backgroundColor: coachColor }}
                        />
                        <div>
                          <span className="block text-[9px] font-black uppercase text-slate-400">
                            Default Coach
                          </span>
                          <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                            Coach {cls.default_coach?.name || 'Unassigned'}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">Permanent</span>
                    </div>

                    {/* Enrolled Students Roster List Preview */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300 mb-2">
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span>Roster: {cls.enrolled_students_count || 0} / {cls.default_capacity || 8}</span>
                        </span>
                        <button
                          onClick={() => handleOpenRoster(cls)}
                          className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          Manage Roster →
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                        {cls.enrolled_students && cls.enrolled_students.length > 0 ? (
                          cls.enrolled_students.map((stu) => (
                            <span
                              key={stu.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-neutral-700"
                            >
                              <span>{stu.full_name}</span>
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] font-medium text-slate-400 italic">
                            No students enrolled yet
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action */}
                  <div className="mt-5 pt-3 border-t border-slate-100 dark:border-neutral-800 flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      Auto Concrete Generator: ON
                    </span>
                    <button
                      onClick={() => handleOpenRoster(cls)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-900 dark:text-white text-xs font-black transition-colors"
                    >
                      Edit Roster
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* ============================================================ */
        /* 2. SCHEDULE VIEW: "When are those classes scheduled?"         */
        /* ============================================================ */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {DAYS_OF_WEEK.map((day) => {
              const dayClasses = scheduleByDay[day.value] || [];

              return (
                <div
                  key={day.value}
                  className="h-full bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] flex flex-col justify-between"
                >
                  <div>
                    {/* Day Header */}
                    <div className="flex items-center justify-between pb-3 border-b-2 border-slate-900 dark:border-neutral-700 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-slate-900 dark:bg-white" />
                        <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                          {day.label}
                        </h3>
                      </div>
                      <span className="text-xs font-black bg-slate-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full border border-slate-300 dark:border-neutral-700">
                        {dayClasses.length} {dayClasses.length === 1 ? 'Class' : 'Classes'}
                      </span>
                    </div>

                    {/* Classes in this Day */}
                    <div className="space-y-3">
                      {dayClasses.length === 0 ? (
                        <div className="py-8 text-center text-xs font-bold text-slate-400 italic">
                          No recurring classes on {day.label}
                        </div>
                      ) : (
                        dayClasses.map((cls) => {
                          const coachColor = cls.default_coach?.color || '#3b82f6';

                          return (
                            <div
                              key={cls.id}
                              className="p-3.5 rounded-2xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50/70 dark:bg-neutral-800/40 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] relative overflow-hidden"
                            >
                              <div
                                className="absolute top-0 left-0 bottom-0 w-1.5"
                                style={{ backgroundColor: coachColor }}
                              />

                              <div className="pl-1.5">
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span className="text-xs font-black text-slate-900 dark:text-white">
                                    {cls.name}
                                  </span>
                                  <span className="text-[10px] font-mono font-bold bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-slate-300 dark:border-neutral-700">
                                    {cls.start_time} – {cls.end_time}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-2">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="w-2 h-2 rounded-full border border-slate-900"
                                      style={{ backgroundColor: coachColor }}
                                    />
                                    <span>Coach {cls.default_coach?.name || 'Assigned'}</span>
                                  </div>
                                  <span>{cls.enrolled_students_count || 0} students</span>
                                </div>

                                <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-neutral-700 flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-400">
                                    📍 {cls.room_location || 'Chess Hall A'}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleOpenRoster(cls)}
                                      className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 hover:underline px-1.5"
                                    >
                                      Roster ({cls.enrolled_students_count})
                                    </button>
                                    <button
                                      onClick={() => handleOpenEdit(cls)}
                                      className="text-[10px] font-black text-slate-700 dark:text-slate-300 hover:underline px-1.5"
                                    >
                                      Edit
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-neutral-800">
                    <button
                      onClick={() => {
                        setEditingClass(null);
                        setFormData({
                          name: '',
                          class_type: 'GROUP',
                          day_of_week: day.value,
                          start_time: '09:30',
                          end_time: '11:00',
                          default_coach_id: coaches[0]?.id || 'coach-1',
                          room_location: 'Chess Hall A',
                          description: '',
                          default_duration_mins: 90,
                          default_capacity: 8,
                          is_active: true,
                          student_ids: [],
                        });
                        setIsModalOpen(true);
                      }}
                      className="w-full py-1.5 rounded-xl border border-dashed border-slate-300 dark:border-neutral-700 hover:border-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs font-bold transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add class on {day.label}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Class Create / Edit Modal */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            if (onCloseInitialCreateModal) onCloseInitialCreateModal();
          }}
          title={editingClass ? 'Edit Permanent Class Definition' : 'Create New Recurring Class'}
        >
          <form onSubmit={handleSaveClass} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Class Title *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Saturday 9:30–11:00 or Foundation Group"
                className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Class Type
                </label>
                <select
                  value={formData.class_type}
                  onChange={(e) => setFormData({ ...formData, class_type: e.target.value as ClassType })}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="GROUP">Group Training</option>
                  <option value="INDIVIDUAL">Individual (1-on-1)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Day of Week
                </label>
                <select
                  value={formData.day_of_week}
                  onChange={(e) => setFormData({ ...formData, day_of_week: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  required
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  required
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Default Coach
                </label>
                <select
                  value={formData.default_coach_id}
                  onChange={(e) => setFormData({ ...formData, default_coach_id: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
                >
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      Coach {c.name} ({c.color_name || 'Pastel'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Venue
                </label>
                <input
                  type="text"
                  value={formData.room_location}
                  onChange={(e) => setFormData({ ...formData, room_location: e.target.value })}
                  placeholder="Chess Hall A - Board 1-4"
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t-2 border-slate-900 dark:border-neutral-700">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="py-2 px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="py-2 px-5 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
              >
                {isSubmitting ? 'Saving...' : editingClass ? 'Update Class' : 'Create Class'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Manage Class Roster Modal */}
      {isRosterModalOpen && rosterClass && (
        <Modal
          isOpen={isRosterModalOpen}
          onClose={() => setIsRosterModalOpen(false)}
          title={`Enrolled Roster: ${rosterClass.name}`}
        >
          <div className="space-y-4">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 flex items-center justify-between text-xs font-bold">
              <span>Selected Students: {selectedRosterStudentIds.length}</span>
              <span className="text-slate-400">Class Day: {DAY_NAMES[rosterClass.day_of_week ?? 6]}</span>
            </div>

            {/* Student Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={rosterStudentSearch}
                onChange={(e) => setRosterStudentSearch(e.target.value)}
                placeholder="Search students by name or ID..."
                className="w-full pl-9 pr-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
            </div>

            {/* Student selection checklist */}
            <div className="max-h-60 overflow-y-auto space-y-1.5 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl p-2 bg-white dark:bg-neutral-900">
              {students
                .filter((s) => {
                  if (!rosterStudentSearch) return true;
                  const q = rosterStudentSearch.toLowerCase().trim();
                  return (
                    s.full_name.toLowerCase().includes(q) ||
                    s.student_id.toLowerCase().includes(q) ||
                    (s.nick_name && s.nick_name.toLowerCase().includes(q))
                  );
                })
                .map((student) => {
                  const isSelected = selectedRosterStudentIds.includes(student.id);

                  return (
                    <div
                      key={student.id}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedRosterStudentIds(selectedRosterStudentIds.filter((id) => id !== student.id));
                        } else {
                          setSelectedRosterStudentIds([...selectedRosterStudentIds, student.id]);
                        }
                      }}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-500 dark:bg-indigo-950/50 dark:border-indigo-500'
                          : 'bg-white hover:bg-slate-50 dark:bg-neutral-800 dark:hover:bg-neutral-700 border-slate-200 dark:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // Handled by parent div
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 pointer-events-none"
                        />
                        <div>
                          <div className="font-black text-xs text-slate-900 dark:text-white">
                            {student.full_name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {student.student_id} {student.school && `• ${student.school}`}
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400">
                          Enrolled
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t-2 border-slate-900 dark:border-neutral-700">
              <button
                type="button"
                onClick={() => setIsRosterModalOpen(false)}
                className="py-2 px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRoster}
                disabled={isSubmitting}
                className="py-2 px-5 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
              >
                {isSubmitting ? 'Saving Roster...' : 'Save Roster'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deletingClass && (
        <Modal
          isOpen={!!deletingClass}
          onClose={() => setDeletingClass(null)}
          title="Delete Permanent Class"
        >
          <div className="space-y-4">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Are you sure you want to delete <span className="font-black text-slate-900 dark:text-white">{deletingClass.name}</span>?
            </p>
            <div className="flex justify-end gap-2 pt-4 border-t-2 border-slate-900 dark:border-neutral-700">
              <button
                type="button"
                onClick={() => setDeletingClass(null)}
                className="py-2 px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteClass}
                disabled={isSubmitting}
                className="py-2 px-5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white border-2 border-rose-800 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
              >
                {isSubmitting ? 'Deleting...' : 'Delete Class'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
