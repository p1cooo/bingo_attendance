import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import { formatMalaysianPhone, isValidMalaysianMobile } from '../../lib/phone.js';
import { useToast } from '../common/Toast.js';
import { Coach } from '../../types.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';
import { Modal } from '../common/Modal.js';
import { Plus, Edit2, Calendar, Phone, Mail, CheckCircle2, Trash2, AlertTriangle } from 'lucide-react';

interface CoachesViewProps {
  initialAddModalOpen?: boolean;
  onCloseInitialAddModal?: () => void;
}

const PASTEL_COLOR_PRESETS = [
  { name: 'Pastel Blue', hex: '#3b82f6' },
  { name: 'Pastel Purple', hex: '#8b5cf6' },
  { name: 'Pastel Green', hex: '#10b981' },
  { name: 'Pastel Amber', hex: '#f59e0b' },
  { name: 'Pastel Pink', hex: '#ec4899' },
  { name: 'Pastel Cyan', hex: '#06b6d4' },
  { name: 'Pastel Indigo', hex: '#6366f1' },
  { name: 'Pastel Rose', hex: '#f43f5e' },
];

export const CoachesView: React.FC<CoachesViewProps> = ({
  initialAddModalOpen = false,
  onCloseInitialAddModal,
}) => {
  const { showToast } = useToast();

  const [coaches, setCoaches] = useState<(Coach & { active_schedules_count?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(initialAddModalOpen);
  const [editingCoach, setEditingCoach] = useState<Coach | null>(null);
  const [deletingCoach, setDeletingCoach] = useState<Coach | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    color: '#3b82f6',
    color_name: 'Pastel Blue',
    bio: '',
    is_active: true,
  });

  const loadCoaches = async () => {
    try {
      setLoading(true);
      const data = await api.getCoaches();
      setCoaches(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to load coaches', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoaches();
  }, []);

  useEffect(() => {
    if (initialAddModalOpen) {
      setIsModalOpen(true);
    }
  }, [initialAddModalOpen]);

  const handleOpenAdd = () => {
    setEditingCoach(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      color: '#3b82f6',
      color_name: 'Pastel Blue',
      bio: '',
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (coach: Coach) => {
    setEditingCoach(coach);
    setFormData({
      name: coach.name,
      email: coach.email,
      phone: coach.phone || '',
      color: coach.color,
      color_name: coach.color_name || 'Pastel Color',
      bio: coach.bio || '',
      is_active: coach.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      showToast('Name and email are required', 'error');
      return;
    }
    if (formData.phone && !isValidMalaysianMobile(formData.phone)) {
      showToast('Enter a valid Malaysian mobile number, e.g. 012-345 6789', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingCoach) {
        await api.updateCoach(editingCoach.id, formData);
        showToast('✓ Coach details updated successfully', 'success');
      } else {
        await api.createCoach(formData);
        showToast('✓ Coach registered successfully', 'success');
      }
      setIsModalOpen(false);
      if (onCloseInitialAddModal) onCloseInitialAddModal();
      await loadCoaches();
    } catch (err: any) {
      showToast(err.message || 'Failed to save coach', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCoach) return;
    try {
      setIsSubmitting(true);
      await api.deleteCoach(deletingCoach.id);
      showToast(`✓ Coach "${deletingCoach.name}" deleted`, 'success');
      setDeletingCoach(null);
      await loadCoaches();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete coach', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">
            Academy Coaches
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Manage coach profiles, pastel visual identity colors, and teaching schedules
          </p>
        </div>

        <button
          id="add-coach-main-btn"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 transition-colors shadow-2xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add Coach</span>
        </button>
      </div>

      {/* Coaches Grid */}
      {loading ? (
        <LoadingSkeleton count={4} type="card" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {coaches.map((coach) => (
            <div
              key={coach.id}
              className="relative bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 shadow-2xs hover:shadow-xs transition-all overflow-hidden flex flex-col justify-between"
            >
              {/* Subtle pastel left accent line */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5"
                style={{ backgroundColor: coach.color }}
              />

              <div className="pl-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: coach.color }}
                      />
                      <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                        Coach {coach.name}
                      </h3>
                    </div>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {coach.color_name || 'Pastel Accent'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(coach)}
                      title="Edit Coach Profile"
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingCoach(coach)}
                      title="Delete Coach"
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {coach.bio && (
                  <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                    {coach.bio}
                  </p>
                )}

                <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-1.5 text-xs text-neutral-500">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-neutral-400" />
                    <span className="truncate">{coach.email}</span>
                  </div>
                  {coach.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-neutral-400" />
                      <span>{coach.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Schedule Badge */}
              <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between pl-2 text-xs">
                <span className="text-neutral-500">Assigned Schedules:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {coach.active_schedules_count ?? 0} active
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Coach Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          if (onCloseInitialAddModal) onCloseInitialAddModal();
        }}
        title={editingCoach ? 'Edit Coach Profile' : 'Add New Coach'}
        subtitle="Configure coach details, authentication email, and assigned pastel identity color."
        maxWidth="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Coach Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Jason or Wei Yuan"
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white focus:border-transparent transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Email Address (Login Account) *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="coach@academy.com"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                inputMode="tel"
                maxLength={12}
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: formatMalaysianPhone(e.target.value) })}
                placeholder="e.g. 012-345 6789"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Pastel Identity Color Picker */}
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
              Pastel Identity Color
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PASTEL_COLOR_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.hex}
                  onClick={() => setFormData({ ...formData, color: preset.hex, color_name: preset.name })}
                  className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                    formData.color === preset.hex
                      ? 'border-neutral-900 dark:border-white bg-neutral-100 dark:bg-neutral-800 ring-2 ring-neutral-900 dark:ring-white'
                      : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: preset.hex }}
                  />
                  <span className="text-[11px] font-medium text-neutral-800 dark:text-neutral-200 truncate">
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Bio / Specialization
            </label>
            <textarea
              rows={2}
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="e.g. Advanced competition sparring, youth fundamentals..."
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white focus:border-transparent transition-all"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false);
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
              {isSubmitting ? 'Saving...' : editingCoach ? 'Save Changes' : 'Create Coach'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingCoach}
        onClose={() => setDeletingCoach(null)}
        title="Delete Coach Profile"
        subtitle="Are you sure you want to delete this coach?"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-rose-800 dark:text-rose-300">
              <span className="font-semibold">Coach {deletingCoach?.name}</span> ({deletingCoach?.email}) will be permanently removed from the system.
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeletingCoach(null)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleDelete}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
