import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../common/Toast.js';
import { AcademyClass, ClassType, Coach, Student } from '../../types.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';
import { Modal } from '../common/Modal.js';
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

export const ClassesView: React.FC = () => {
  const { showToast } = useToast();

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
  const [isModalOpen, setIsModalOpen] = useState(false);
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
      showToast(err.message || 'Failed to load classes', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [searchQuery, filterCoachId, filterClassType, filterDay, filterStatus]);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Class name is required (e.g. Saturday 9:30–11:00)', 'error');
      return;
    }
    if (!formData.default_coach_id) {
      showToast('Please assign a default coach to this class', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingClass) {
        await api.updateClass(editingClass.id, formData);
        showToast('✓ Class updated successfully. Recurring default coach updated.', 'success');
      } else {
        await api.createClass(formData);
        showToast('✓ New class created with default coach schedule', 'success');
      }
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to save class', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveRoster = async () => {
    if (!rosterClass) return;
    try {
      setIsSubmitting(true);
      await api.updateClass(rosterClass.id, {
        student_ids: selectedRosterStudentIds,
      });
      showToast(`✓ Roster updated for ${rosterClass.name} (${selectedRosterStudentIds.length} students)`, 'success');
      setIsRosterModalOpen(false);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update roster', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingClass) return;
    try {
      setIsSubmitting(true);
      await api.deleteClass(deletingClass.id);
      showToast(`✓ Class "${deletingClass.name}" deleted`, 'success');
      setDeletingClass(null);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete class', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDayName = (dayNum?: number) => {
    const found = DAYS_OF_WEEK.find((d) => d.value === dayNum);
    return found ? found.label : 'Saturday';
  };

  const filteredRosterStudents = students.filter((s) => {
    const q = rosterStudentSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      s.full_name.toLowerCase().includes(q) ||
      (s.nick_name && s.nick_name.toLowerCase().includes(q)) ||
      s.student_id.toLowerCase().includes(q) ||
      (s.school && s.school.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-neutral-900 p-6 rounded-3xl border-2 border-slate-900 dark:border-neutral-800 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              Recurring Architecture
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {classes.length} Permanent Classes
            </span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
            Classes
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Manage the academy's permanent recurring classes. Each class has a single assigned{' '}
            <strong className="text-slate-900 dark:text-white font-bold">Default Coach</strong> who automatically
            owns all weekly occurrences, along with its designated room and enrolled students.
          </p>
        </div>

        <button
          id="add-class-btn"
          onClick={handleOpenAdd}
          className="inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-2xl text-xs font-black bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)] transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>+ Add Class</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-neutral-900 p-4 rounded-2xl border-2 border-slate-900 dark:border-neutral-800 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.05)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="classes-search-input"
              type="text"
              placeholder="Search class or coach..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs font-medium bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-slate-900 dark:focus:border-white transition-colors"
            />
          </div>

          {/* Coach Filter */}
          <div>
            <select
              id="classes-filter-coach"
              value={filterCoachId}
              onChange={(e) => setFilterCoachId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-900 dark:focus:border-white transition-colors"
            >
              <option value="">All Coaches</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  Coach: {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Class Type Filter */}
          <div>
            <select
              id="classes-filter-type"
              value={filterClassType}
              onChange={(e) => setFilterClassType(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-900 dark:focus:border-white transition-colors"
            >
              <option value="">All Class Types</option>
              <option value="GROUP">Group Class (4/month)</option>
              <option value="INDIVIDUAL">Individual 1-on-1</option>
            </select>
          </div>

          {/* Day Filter */}
          <div>
            <select
              id="classes-filter-day"
              value={filterDay}
              onChange={(e) => setFilterDay(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-900 dark:focus:border-white transition-colors"
            >
              <option value="">All Days of Week</option>
              {DAYS_OF_WEEK.map((d) => (
                <option key={d.value} value={d.value}>
                  Every {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status & Reset */}
          <div className="flex items-center gap-2">
            <select
              id="classes-filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="flex-1 px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-900 dark:focus:border-white transition-colors"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>

            {(searchQuery || filterCoachId || filterClassType || filterDay || filterStatus) && (
              <button
                onClick={handleResetFilters}
                title="Reset all filters"
                className="p-2 rounded-xl border-2 border-slate-200 dark:border-neutral-700 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid of Classes */}
      {loading ? (
        <LoadingSkeleton count={6} type="card" />
      ) : classes.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 p-12 text-center rounded-3xl border-2 border-dashed border-slate-300 dark:border-neutral-700">
          <BookOpenIconPlaceholder />
          <h3 className="text-base font-bold text-slate-900 dark:text-white mt-4">
            No classes found
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            {searchQuery || filterCoachId || filterClassType || filterDay || filterStatus
              ? 'Try clearing your search filters to view all recurring academy classes.'
              : 'Create your first recurring class (e.g. Saturday 9:30–11:00) with its default coach.'}
          </p>
          <button
            onClick={handleOpenAdd}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Class</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {classes.map((cls) => {
            const coach = cls.default_coach;
            const coachColor = coach?.color || '#3b82f6';
            const enrolledCount = cls.enrolled_students_count ?? (cls.enrolled_student_ids?.length || 0);
            const capacity = cls.default_capacity || 8;
            const isFull = enrolledCount >= capacity;

            return (
              <div
                key={cls.id}
                id={`class-card-${cls.id}`}
                style={{
                  borderLeftColor: coachColor,
                  borderLeftWidth: '6px',
                }}
                className="bg-white dark:bg-neutral-900 rounded-3xl border-2 border-slate-900 dark:border-neutral-800 p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)] hover:translate-y-[-2px] transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top Badges & Actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                          cls.class_type === 'GROUP'
                            ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                            : 'bg-amber-50 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        {cls.class_type === 'GROUP' ? 'Group (4/mo)' : '1-on-1 Individual'}
                      </span>

                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                          cls.is_active
                            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-slate-400 border border-slate-200 dark:border-neutral-700'
                        }`}
                      >
                        {cls.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(cls)}
                        title="Edit Class Details"
                        className="p-1.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingClass(cls)}
                        title="Delete Class"
                        className="p-1.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Class Name */}
                  <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight mt-3">
                    {cls.name}
                  </h3>

                  {/* Default Coach Badge (Subtle Pastel Accent) */}
                  <div className="mt-3.5 flex items-center gap-2 p-2.5 rounded-2xl bg-slate-50 dark:bg-neutral-800/80 border border-slate-200/80 dark:border-neutral-700">
                    <div
                      className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black text-white shrink-0 shadow-2xs"
                      style={{ backgroundColor: coachColor }}
                    >
                      {coach?.name ? coach.name.charAt(0) : 'C'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] uppercase font-black tracking-wider text-slate-500 dark:text-slate-400">
                        Default Coach
                      </div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                        <span>Coach {coach?.name || 'Unassigned'}</span>
                        <span
                          className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                          style={{ backgroundColor: coachColor }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Recurring Schedule Info */}
                  <div className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        Every <strong className="text-slate-900 dark:text-white font-bold">{getDayName(cls.day_of_week)}</strong> • {cls.start_time || '09:30'} – {cls.end_time || '11:00'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-medium">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{cls.room_location || 'Chess Hall A'}</span>
                    </div>

                    {cls.description && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 italic">
                        "{cls.description}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Bottom Roster & Manage */}
                <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-neutral-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span
                      className={`text-xs font-bold ${
                        isFull
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {enrolledCount} / {capacity} Students
                    </span>
                  </div>

                  <button
                    onClick={() => handleOpenRoster(cls)}
                    className="inline-flex items-center gap-1 text-[11px] font-black text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline cursor-pointer"
                  >
                    <span>Manage Roster</span>
                    <ChevronRight className="w-3 h-3 stroke-[3]" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Class Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSubmitting && setIsModalOpen(false)}
        title={editingClass ? `Edit Class: ${editingClass.name}` : 'Create Permanent Class'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="bg-indigo-50 dark:bg-indigo-950/40 p-3 rounded-2xl border border-indigo-200 dark:border-indigo-800/60 text-xs text-indigo-900 dark:text-indigo-300">
            <p className="font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Default Coach Architecture</span>
            </p>
            <p className="text-[11px] mt-0.5 text-indigo-800 dark:text-indigo-300/90 leading-relaxed">
              The default coach is assigned to the class once. Every weekly session automatically belongs to this coach. One-time substitute coaches are handled in the Sessions tab without altering this class rule.
            </p>
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
              Class Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Saturday 9:30–11:00 or Joshua – Individual"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-900 dark:focus:border-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                Class Type *
              </label>
              <select
                value={formData.class_type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    class_type: e.target.value as ClassType,
                    default_capacity: e.target.value === 'INDIVIDUAL' ? 1 : 8,
                    default_duration_mins: e.target.value === 'INDIVIDUAL' ? 60 : 90,
                  })
                }
                className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white"
              >
                <option value="GROUP">Group Class (4 Lessons / Month)</option>
                <option value="INDIVIDUAL">Individual 1-on-1 (Private)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                Default Coach *
              </label>
              <select
                value={formData.default_coach_id}
                onChange={(e) => setFormData({ ...formData, default_coach_id: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white"
              >
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    Coach {c.name} ({c.color_name || 'Pastel'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                Day of Week *
              </label>
              <select
                value={formData.day_of_week}
                onChange={(e) => setFormData({ ...formData, day_of_week: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white"
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d.value} value={d.value}>
                    Every {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                Start Time *
              </label>
              <input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                End Time *
              </label>
              <input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                Room / Board Location
              </label>
              <input
                type="text"
                placeholder="e.g. Chess Hall A - Board 1-4"
                value={formData.room_location}
                onChange={(e) => setFormData({ ...formData, room_location: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs font-medium bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                Max Student Capacity
              </label>
              <input
                type="number"
                min="1"
                max="24"
                value={formData.default_capacity}
                onChange={(e) => setFormData({ ...formData, default_capacity: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
              Description / Class Notes
            </label>
            <textarea
              rows={2}
              placeholder="Notes on level, objectives, or sparring format..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="class-is-active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 rounded text-slate-900 border-slate-300 focus:ring-slate-900"
            />
            <label htmlFor="class-is-active" className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
              Active recurring class
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-neutral-800">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black rounded-xl border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
            >
              {isSubmitting ? 'Saving...' : editingClass ? 'Update Class' : 'Create Class'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Manage Class Roster Modal */}
      <Modal
        isOpen={isRosterModalOpen}
        onClose={() => !isSubmitting && setIsRosterModalOpen(false)}
        title={rosterClass ? `Class Roster: ${rosterClass.name}` : 'Class Roster'}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300">
              Assigned Students ({selectedRosterStudentIds.length} / {rosterClass?.default_capacity || 8})
            </span>
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              Default Coach: Coach {rosterClass?.default_coach?.name || 'Assigned'}
            </span>
          </div>

          {/* Student Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search students to assign..."
              value={rosterStudentSearch}
              onChange={(e) => setRosterStudentSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>

          {/* Student Checklist */}
          <div className="max-h-64 overflow-y-auto border-2 border-slate-200 dark:border-neutral-700 rounded-2xl divide-y divide-slate-100 dark:divide-neutral-800 p-1">
            {filteredRosterStudents.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">No students found</div>
            ) : (
              filteredRosterStudents.map((stu) => {
                const isSelected = selectedRosterStudentIds.includes(stu.id);
                return (
                  <label
                    key={stu.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                        : 'hover:bg-slate-50 dark:hover:bg-neutral-800/60 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRosterStudentIds([...selectedRosterStudentIds, stu.id]);
                          } else {
                            setSelectedRosterStudentIds(
                              selectedRosterStudentIds.filter((id) => id !== stu.id)
                            );
                          }
                        }}
                        className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                      />
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {stu.full_name} {stu.nick_name && `(${stu.nick_name})`}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {stu.student_id} • {stu.school || 'Academy Student'}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded-md">
                        Enrolled
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-neutral-800">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsRosterModalOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSaveRoster}
              className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black rounded-xl border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
            >
              {isSubmitting ? 'Saving Roster...' : 'Save Roster'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingClass}
        onClose={() => !isSubmitting && setDeletingClass(null)}
        title="Delete Recurring Class"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300">
            <p className="font-bold flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Are you sure you want to delete this class?</span>
            </p>
            <p className="mt-1 leading-relaxed">
              Deleting <strong>"{deletingClass?.name}"</strong> will remove its recurring schedule.
              Past completed attendance records will remain preserved in historical audit logs.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setDeletingClass(null)}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleDelete}
              className="px-5 py-2.5 bg-rose-600 text-white text-xs font-black rounded-xl border-2 border-rose-700 shadow-[2px_2px_0px_0px_rgba(190,18,60,1)]"
            >
              {isSubmitting ? 'Deleting...' : 'Delete Class'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const BookOpenIconPlaceholder: React.FC = () => (
  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-neutral-800 flex items-center justify-center mx-auto text-slate-400">
    <Users className="w-6 h-6" />
  </div>
);
