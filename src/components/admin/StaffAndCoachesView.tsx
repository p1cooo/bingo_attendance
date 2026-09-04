import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  UserPlus,
  Shield,
  ShieldAlert,
  KeyRound,
  Trash2,
  Edit2,
  Search,
  CheckCircle2,
  XCircle,
  Users,
  Briefcase,
  Sparkles,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  Lock,
  Phone,
  Mail,
  Palette,
  Calendar,
} from 'lucide-react';
import { User, Coach, Student, UserRole } from '../../types.js';
import { api } from '../../lib/api.js';
import { formatMalaysianPhone, isValidMalaysianMobile } from '../../lib/phone.js';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../common/Toast.js';
import { Modal } from '../common/Modal.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';

interface UserWithProfiles extends User {
  coach_profile?: Coach;
  student_profile?: Student;
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

interface StaffAndCoachesViewProps {
  initialAddModalOpen?: boolean;
  onCloseInitialAddModal?: () => void;
}

export const StaffAndCoachesView: React.FC<StaffAndCoachesViewProps> = ({
  initialAddModalOpen = false,
  onCloseInitialAddModal,
}) => {
  const { user: currentUser, isSuperAdmin } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserWithProfiles[]>([]);
  const [coaches, setCoaches] = useState<(Coach & { active_schedules_count?: number })[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(initialAddModalOpen);
  const [editingUser, setEditingUser] = useState<UserWithProfiles | null>(null);
  const [editingCoach, setEditingCoach] = useState<Coach | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserWithProfiles | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserWithProfiles | null>(null);

  // Unified Create Form State
  const [createFormData, setCreateFormData] = useState({
    role: 'COACH' as UserRole,
    displayName: '',
    username: '',
    email: '',
    password: '',
    phone: '',
    color: '#3b82f6',
    color_name: 'Pastel Blue',
    bio: '',
    is_active: true,
  });

  // Edit User Form State
  const [editFormData, setEditFormData] = useState({
    displayName: '',
    username: '',
    email: '',
    role: 'COACH' as UserRole,
    coach_id: '',
    student_id: '',
    is_active: true,
  });

  // Password reset state
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchAllData = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [usersRes, coachesRes, studentsRes] = await Promise.all([
        api.getUsers(),
        api.getCoaches(),
        api.getStudents(),
      ]);
      setUsers(usersRes.users || []);
      setCoaches(coachesRes || []);
      setStudents(studentsRes || []);
      setFetchError(null);
    } catch (err: any) {
      const msg = err.message || 'Failed to load staff & coaches';
      setFetchError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    if (initialAddModalOpen) {
      setIsCreateModalOpen(true);
    }
  }, [initialAddModalOpen]);

  const openCreateModal = (preselectedRole: UserRole = 'COACH') => {
    const roleToUse: UserRole = isSuperAdmin ? preselectedRole : 'COACH';
    setCreateFormData({
      role: roleToUse,
      displayName: '',
      username: '',
      email: '',
      password: '',
      phone: '',
      color: '#3b82f6',
      color_name: 'Pastel Blue',
      bio: '',
      is_active: true,
    });
    setIsCreateModalOpen(true);
  };

  const openEditModal = (targetUser: UserWithProfiles) => {
    setEditingUser(targetUser);
    setEditFormData({
      displayName: targetUser.name || targetUser.username || '',
      username: targetUser.username || '',
      email: targetUser.email || '',
      role: targetUser.role,
      coach_id: targetUser.coach_id || '',
      student_id: targetUser.student_id || '',
      is_active: targetUser.is_active,
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createFormData.displayName.trim() || !createFormData.username.trim() || !createFormData.email.trim()) {
      showToast('Please complete all required fields', 'error');
      return;
    }
    if (!createFormData.password || createFormData.password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    if (createFormData.role === 'COACH' && !isValidMalaysianMobile(createFormData.phone)) {
      showToast('Enter a valid Malaysian mobile number, e.g. 012-345 6789', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      // Provision the Firebase-backed user first. The coach profile endpoint links to
      // this account by email, so creating the profile before the account is invalid.
      await api.createUser({
        displayName: createFormData.displayName.trim(),
        username: createFormData.username.trim().toLowerCase(),
        email: createFormData.email.trim(),
        role: createFormData.role,
        password: createFormData.password,
      });

      if (createFormData.role === 'COACH') {
        await api.createCoach({
          name: createFormData.displayName.trim(),
          email: createFormData.email.trim(),
          phone: createFormData.phone.trim(),
          color: createFormData.color,
          color_name: createFormData.color_name,
          bio: createFormData.bio.trim(),
          is_active: createFormData.is_active,
        });
      }

      showToast(`✓ Created account for ${createFormData.displayName} successfully!`, 'success');
      setIsCreateModalOpen(false);
      if (onCloseInitialAddModal) onCloseInitialAddModal();
      fetchAllData();
    } catch (err: any) {
      showToast(err.message || 'Failed to create team member', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsSubmitting(true);
    try {
      await api.updateUser(editingUser.id, {
        name: editFormData.displayName.trim(),
        email: editFormData.email.trim(),
        role: editFormData.role,
        coach_id: editFormData.role === 'COACH' ? editFormData.coach_id || undefined : undefined,
        is_active: editFormData.is_active,
      });

      // If user is linked to coach profile, sync coach details if desired
      if (editingUser.coach_id && editFormData.role === 'COACH') {
        try {
          await api.updateCoach(editingUser.coach_id, {
            name: editFormData.displayName.trim(),
            email: editFormData.email.trim(),
            is_active: editFormData.is_active,
          });
        } catch {
          // ignore coach profile update errors
        }
      }

      showToast(`✓ Updated ${editFormData.displayName} successfully`, 'success');
      setEditingUser(null);
      fetchAllData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update user', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser || !newPassword || newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.resetUserPassword(resetPasswordUser.id, newPassword);
      showToast(`✓ Password reset for ${resetPasswordUser.name || resetPasswordUser.username}`, 'success');
      setResetPasswordUser(null);
      setNewPassword('');
    } catch (err: any) {
      showToast(err.message || 'Failed to reset password', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setIsSubmitting(true);
    try {
      await api.deleteUser(deletingUser.id);
      showToast(`✓ Deleted account ${deletingUser.name || deletingUser.username}`, 'success');
      setDeletingUser(null);
      fetchAllData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete user', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    // Search query filter
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      u.name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.coach_profile?.name.toLowerCase().includes(q) ||
      u.coach_profile?.phone?.toLowerCase().includes(q);

    // Role filter
    let matchesRole = true;
    if (selectedRoleFilter === 'COACH') {
      matchesRole = u.role === 'COACH';
    } else if (selectedRoleFilter === 'ADMIN') {
      matchesRole = u.role === 'ADMIN';
    } else if (selectedRoleFilter === 'SUPER_ADMIN') {
      matchesRole = u.role === 'SUPER_ADMIN';
    } else if (selectedRoleFilter !== 'ALL') {
      matchesRole = u.role === selectedRoleFilter;
    }

    // Status filter
    let matchesStatus = true;
    if (selectedStatusFilter === 'ACTIVE') {
      matchesStatus = u.is_active === true;
    } else if (selectedStatusFilter === 'INACTIVE') {
      matchesStatus = u.is_active === false;
    }

    return matchesSearch && matchesRole && matchesStatus;
  });

  const coachCount = users.filter((u) => u.role === 'COACH').length;
  const adminCount = users.filter((u) => u.role === 'ADMIN').length;
  const superAdminCount = users.filter((u) => u.role === 'SUPER_ADMIN').length;

  return (
    <div className="space-y-6">
      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Staff & Coaches
            </h2>
            {fetchError ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800">
                Load Error
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-neutral-700">
                {users.length} Total
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage coach timetables, administrator credentials, access roles, and Firebase accounts
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {!isSuperAdmin && (
            <button
              id="add-coach-quick-btn"
              type="button"
              onClick={() => openCreateModal('COACH')}
              className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200 border-2 border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors cursor-pointer"
            >
              <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>+ Add Coach</span>
            </button>
          )}

          {isSuperAdmin && (
            <button
              id="add-admin-main-btn"
              type="button"
              onClick={() => openCreateModal('ADMIN')}
              className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 transition-colors shadow-2xs cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Add Admin</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border-2 border-slate-900/10 dark:border-neutral-800 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              id="staff-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, handle, email, or coach phone..."
              className="w-full pl-9 pr-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white"
            />
          </div>

          {/* Role Filter */}
          <div>
            <select
              id="staff-role-filter"
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="ALL">All Roles ({users.length})</option>
              <option value="COACH">Coaches Only ({coachCount})</option>
              <option value="ADMIN">Admins Only ({adminCount})</option>
              <option value="SUPER_ADMIN">Super Admins ({superAdminCount})</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              id="staff-status-filter"
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-3xl border-2 border-slate-900 dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <LoadingSkeleton count={4} />
          </div>
        ) : fetchError ? (
          <div className="p-12 text-center space-y-4 bg-rose-50/30 dark:bg-rose-950/20">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center border-2 border-rose-200 dark:border-rose-800 shadow-xs">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-base font-black text-rose-900 dark:text-rose-200">
                Unable to Load Personnel Data
              </h3>
              <p className="text-xs text-rose-700 dark:text-rose-300 font-bold">
                {fetchError}
              </p>
            </div>
            <button
              type="button"
              onClick={fetchAllData}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Loading</span>
            </button>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-neutral-800 text-slate-400 mx-auto flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">No personnel found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No staff or coaches matched your current search or filter criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white dark:bg-neutral-800 border-b border-slate-800 dark:border-neutral-700">
                <tr>
                  <th className="py-3 px-4 font-black uppercase text-[10px]">Team Member</th>
                  <th className="py-3 px-4 font-black uppercase text-[10px]">Handle & Contact</th>
                  <th className="py-3 px-4 font-black uppercase text-[10px]">Role / Privilege</th>
                  <th className="py-3 px-4 font-black uppercase text-[10px]">Profile / Color</th>
                  <th className="py-3 px-4 font-black uppercase text-[10px] text-center">Status</th>
                  <th className="py-3 px-4 font-black uppercase text-[10px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                {filteredUsers.map((u) => {
                  const isCurrentUser = currentUser?.id === u.id;
                  const isCoach = u.role === 'COACH';
                  const matchedCoach = u.coach_profile || coaches.find((c) => c.id === u.coach_id || c.email === u.email);

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-neutral-800/40 transition-colors"
                    >
                      {/* Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full border-2 border-slate-900 flex items-center justify-center font-black text-xs text-white shrink-0 shadow-xs"
                            style={{
                              backgroundColor: matchedCoach?.color || (isCoach ? '#3b82f6' : u.role === 'SUPER_ADMIN' ? '#f59e0b' : '#64748b'),
                            }}
                          >
                            {(u.name || u.username || 'U').substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{u.name || u.username}</span>
                              {isCurrentUser && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">{u.username}</div>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-1 font-medium text-[11px]">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{u.email}</span>
                        </div>
                        {matchedCoach?.phone && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{matchedCoach.phone}</span>
                          </div>
                        )}
                      </td>

                      {/* Role */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                            u.role === 'SUPER_ADMIN'
                              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                              : u.role === 'ADMIN'
                              ? 'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200 border-purple-300 dark:border-purple-700'
                              : 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 border-blue-300 dark:border-blue-700'
                          }`}
                        >
                          {u.role === 'SUPER_ADMIN' && <ShieldAlert className="w-3 h-3 text-amber-600" />}
                          {u.role === 'ADMIN' && <Shield className="w-3 h-3 text-purple-600" />}
                          {u.role === 'COACH' && <UserCheck className="w-3 h-3 text-blue-600" />}
                          <span>{u.role === 'SUPER_ADMIN' ? 'Super Admin' : u.role === 'ADMIN' ? 'Admin' : 'Coach'}</span>
                        </span>
                      </td>

                      {/* Profile / Timetable Color */}
                      <td className="py-3.5 px-4">
                        {isCoach && matchedCoach ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-slate-900/40"
                              style={{ backgroundColor: matchedCoach.color }}
                            />
                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                              {matchedCoach.color_name || 'Coach Color'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Admin Console Access</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                            u.is_active
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                          }`}
                        >
                          {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isSuperAdmin && (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN') ? (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 px-2 py-1 bg-slate-100 dark:bg-neutral-800 rounded-lg"
                              title="Administrator account (Protected)"
                            >
                              <Lock className="w-3 h-3" />
                              <span>Protected</span>
                            </span>
                          ) : (
                            <>
                              <button
                                id={`reset-pwd-${u.id}`}
                                onClick={() => {
                                  setResetPasswordUser(u);
                                  setNewPassword('');
                                }}
                                className="p-1.5 rounded-xl bg-slate-100 dark:bg-neutral-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-slate-700 dark:text-slate-300 hover:text-amber-700 transition-all cursor-pointer"
                                title="Reset Firebase Auth Password"
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>

                              <button
                                id={`edit-user-${u.id}`}
                                onClick={() => openEditModal(u)}
                                className="p-1.5 rounded-xl bg-slate-100 dark:bg-neutral-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-slate-700 dark:text-slate-300 hover:text-blue-700 transition-all cursor-pointer"
                                title="Edit Details"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              {!isCurrentUser && (
                                <button
                                  id={`delete-user-${u.id}`}
                                  onClick={() => setDeletingUser(u)}
                                  className="p-1.5 rounded-xl bg-slate-100 dark:bg-neutral-800 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-slate-700 dark:text-slate-300 hover:text-rose-700 transition-all cursor-pointer"
                                  title="Delete Account"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
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

      {/* UNIFIED CREATE MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-neutral-900 border-3 border-slate-900 dark:border-white rounded-3xl max-w-lg w-full p-6 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.15)] space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b-2 border-slate-100 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Add Team Member
                  </h3>
                  <p className="text-xs text-slate-500">
                    Create coach timetable profile & login credentials
                  </p>
                </div>
              </div>
              <button
                id="close-create-modal"
                onClick={() => {
                  setIsCreateModalOpen(false);
                  if (onCloseInitialAddModal) onCloseInitialAddModal();
                }}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Role Picker */}
              {isSuperAdmin ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Role Assignment *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['COACH', 'ADMIN', 'SUPER_ADMIN'] as UserRole[]).map((r) => (
                      <button
                        type="button"
                        key={r}
                        id={`select-role-${r}`}
                        onClick={() => setCreateFormData({ ...createFormData, role: r })}
                        className={`py-2 px-2 rounded-2xl text-[11px] font-black border-2 transition-all cursor-pointer ${
                          createFormData.role === r
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs'
                            : 'bg-slate-50 dark:bg-neutral-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-neutral-700'
                        }`}
                      >
                        {r === 'COACH' ? 'Coach' : r === 'ADMIN' ? 'Admin' : 'Super Admin'}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <div>
                      <div className="text-xs font-black text-blue-950 dark:text-blue-200">Coach Account</div>
                      <div className="text-[10px] text-blue-800 dark:text-blue-300">Creates coach profile & login credentials</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-200">
                    ROLE: COACH
                  </span>
                </div>
              )}

              {/* Name & Username */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Full Name *
                  </label>
                  <input
                    id="new-member-name"
                    type="text"
                    required
                    placeholder="e.g. Wei Yuan"
                    value={createFormData.displayName}
                    onChange={(e) =>
                      setCreateFormData({
                        ...createFormData,
                        displayName: e.target.value,
                        username:
                          createFormData.username ||
                          `coach${e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
                      })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Username / Handle *
                  </label>
                  <input
                    id="new-member-username"
                    type="text"
                    required
                    placeholder="e.g. coachweiyuan"
                    value={createFormData.username}
                    onChange={(e) =>
                      setCreateFormData({
                        ...createFormData,
                        username: e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''),
                      })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Email Address *
                  </label>
                  <input
                    id="new-member-email"
                    type="email"
                    required
                    placeholder="e.g. weiyuan@academy.com"
                    value={createFormData.email}
                    onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Phone Number {createFormData.role === 'COACH' ? '*' : '(Optional)'}
                  </label>
                  <input
                    id="new-member-phone"
                    type="tel"
                    inputMode="tel"
                    maxLength={12}
                    placeholder="e.g. 012-345 6789"
                    value={createFormData.phone}
                    onChange={(e) => setCreateFormData({ ...createFormData, phone: formatMalaysianPhone(e.target.value) })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Initial Password * (Firebase Auth)
                </label>
                <div className="relative">
                  <input
                    id="new-member-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Minimum 6 characters"
                    value={createFormData.password}
                    onChange={(e) => setCreateFormData({ ...createFormData, password: e.target.value })}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Coach Specific Color Preset */}
              {createFormData.role === 'COACH' && (
                <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-800 space-y-2.5">
                  <label className="block text-xs font-black uppercase tracking-wider text-blue-950 dark:text-blue-200">
                    Timetable Color Assignment *
                  </label>
                  <p className="text-[11px] text-blue-900 dark:text-blue-300">
                    Used to identify this coach across sessions, cards, and daily schedules
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {PASTEL_COLOR_PRESETS.map((preset) => {
                      const isSelected = createFormData.color === preset.hex;
                      return (
                        <button
                          key={preset.hex}
                          type="button"
                          onClick={() =>
                            setCreateFormData({
                              ...createFormData,
                              color: preset.hex,
                              color_name: preset.name,
                            })
                          }
                          className={`flex items-center gap-1.5 p-1.5 rounded-xl border-2 text-[10px] font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'border-slate-900 dark:border-white bg-white dark:bg-neutral-800 shadow-xs'
                              : 'border-transparent hover:bg-white/50 dark:hover:bg-neutral-800/50'
                          }`}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-slate-900/30 shrink-0"
                            style={{ backgroundColor: preset.hex }}
                          />
                          <span className="truncate text-slate-800 dark:text-slate-200">{preset.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t-2 border-slate-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    if (onCloseInitialAddModal) onCloseInitialAddModal();
                  }}
                  className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="submit-create-member-btn"
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black text-xs border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:bg-slate-800 dark:hover:bg-slate-100 transition-all active:translate-x-0.5 active:translate-y-0.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Create Account</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingUser && (
        <Modal
          isOpen={true}
          onClose={() => setEditingUser(null)}
          title={`Edit Account: ${editingUser.displayName || editingUser.username}`}
        >
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Full Name
              </label>
              <input
                type="text"
                required
                value={editFormData.displayName}
                onChange={(e) => setEditFormData({ ...editFormData, displayName: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Email Address
              </label>
              <input
                type="email"
                required
                value={editFormData.email}
                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Role
              </label>
              {isSuperAdmin ? (
                <select
                  value={editFormData.role}
                  onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="COACH">Coach</option>
                  <option value="ADMIN">Admin</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                </select>
              ) : (
                <input
                  type="text"
                  disabled
                  value={editFormData.role === 'COACH' ? 'Coach' : editFormData.role === 'ADMIN' ? 'Admin' : 'Super Admin'}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-neutral-800 border-2 border-slate-300 dark:border-neutral-700 rounded-xl text-xs font-bold text-slate-500 opacity-80"
                />
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="edit-user-active"
                checked={editFormData.is_active}
                onChange={(e) => setEditFormData({ ...editFormData, is_active: e.target.checked })}
                className="w-4 h-4 text-slate-900 rounded border-2 border-slate-900 cursor-pointer"
              />
              <label htmlFor="edit-user-active" className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                Account Active & Authorized to Sign In
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white font-black text-xs hover:bg-slate-800"
              >
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* RESET PASSWORD MODAL */}
      {resetPasswordUser && (
        <Modal
          isOpen={true}
          onClose={() => setResetPasswordUser(null)}
          title={`Reset Password: ${resetPasswordUser.displayName || resetPasswordUser.username}`}
        >
          <form onSubmit={handleResetPassword} className="space-y-4">
            <p className="text-xs text-slate-500">
              Set a new secure password for <strong>{resetPasswordUser.email}</strong> in Firebase Authentication.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">
                New Password (Min 6 chars)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setResetPasswordUser(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs hover:bg-amber-400 border-2 border-slate-900 shadow-xs"
              >
                Update Password
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingUser && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingUser(null)}
          title="Confirm Account Deletion"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-500 text-rose-900 dark:text-rose-200 text-xs font-medium space-y-1">
              <div className="flex items-center gap-2 font-black text-rose-700 dark:text-rose-400">
                <AlertTriangle className="w-4 h-4" />
                <span>Permanent Action</span>
              </div>
              <p>
                Are you sure you want to delete the account for <strong>{deletingUser.displayName || deletingUser.username}</strong> ({deletingUser.email})?
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
