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
  GraduationCap,
  Sparkles,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { User, Coach, Student, UserRole } from '../../types.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../common/Toast.js';

interface UserWithProfiles extends User {
  coach_profile?: Coach;
  student_profile?: Student;
}

export const UserAccountsView: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserWithProfiles[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithProfiles | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserWithProfiles | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserWithProfiles | null>(null);

  // Form states for Create / Edit
  const [formData, setFormData] = useState({
    displayName: '',
    username: '',
    email: '',
    role: 'COACH' as UserRole,
    password: '',
    coach_id: '',
    student_id: '',
    is_active: true,
  });

  // Password reset state
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const msg = err.message || 'Failed to load user accounts';
      setFetchError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const openCreateModal = () => {
    setFormData({
      displayName: '',
      username: '',
      email: '',
      role: 'COACH',
      password: '',
      coach_id: '',
      student_id: '',
      is_active: true,
    });
    setIsCreateModalOpen(true);
  };

  const openEditModal = (target: UserWithProfiles) => {
    setEditingUser(target);
    setFormData({
      displayName: target.name || '',
      username: target.username || '',
      email: target.email || '',
      role: target.role,
      password: '',
      coach_id: target.coach_id || '',
      student_id: target.student_id || '',
      is_active: target.is_active,
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.displayName.trim() || !formData.email.trim() || !formData.password.trim()) {
      showToast('Name, Email, and Password are required', 'error');
      return;
    }
    if (formData.password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createUser({
        displayName: formData.displayName.trim(),
        username: formData.username.trim() || formData.email.split('@')[0],
        email: formData.email.trim(),
        role: formData.role,
        password: formData.password,
        coach_id: formData.role === 'COACH' ? formData.coach_id : undefined,
      });

      showToast(`Account for ${formData.displayName} created successfully!`, 'success');
      setIsCreateModalOpen(false);
      fetchAllData();
    } catch (err: any) {
      showToast(err.message || 'Failed to create account', 'error');
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
        name: formData.displayName.trim(),
        username: formData.username.trim(),
        email: formData.email.trim(),
        role: formData.role,
        is_active: formData.is_active,
        coach_id: formData.role === 'COACH' ? formData.coach_id : undefined,
      });

      showToast(`Account ${formData.displayName} updated successfully!`, 'success');
      setEditingUser(null);
      fetchAllData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update account', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser) return;
    if (!newPassword || newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.resetUserPassword(resetPasswordUser.id, newPassword);
      showToast(`Password for ${resetPasswordUser.name} updated in Firebase Auth!`, 'success');
      setResetPasswordUser(null);
      setNewPassword('');
    } catch (err: any) {
      showToast(err.message || 'Failed to reset password', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (target: UserWithProfiles) => {
    if (target.id === currentUser?.id) {
      showToast('You cannot deactivate your own active Super Admin account', 'warning');
      return;
    }
    const newStatus = !target.is_active;
    try {
      await api.updateUser(target.id, { is_active: newStatus });
      showToast(`Account ${target.name} ${newStatus ? 'activated' : 'deactivated'}`, 'info');
      fetchAllData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setIsSubmitting(true);
    try {
      await api.deleteUser(deletingUser.id);
      showToast(`Account ${deletingUser.name} deleted successfully`, 'success');
      setDeletingUser(null);
      fetchAllData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete user', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered list
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !searchQuery.trim() ||
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = selectedRoleFilter === 'ALL' || u.role === selectedRoleFilter;
    const matchesStatus =
      selectedStatusFilter === 'ALL' ||
      (selectedStatusFilter === 'ACTIVE' && u.is_active) ||
      (selectedStatusFilter === 'INACTIVE' && !u.is_active);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalUsers = users.length;
  const totalCoaches = users.filter((u) => u.role === 'COACH').length;
  const totalAdmins = users.filter((u) => u.role === 'ADMIN').length;
  const totalSuperAdmins = users.filter((u) => u.role === 'SUPER_ADMIN').length;

  if (currentUser?.role !== 'SUPER_ADMIN') {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-800 rounded-3xl p-8 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/40 border-2 border-amber-400 flex items-center justify-center mx-auto mb-4 text-amber-700 dark:text-amber-300">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">
            Super Administrator Privilege Required
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
            User account management, credential creation, and password resets are strictly restricted to the Super Admin role.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-800 rounded-3xl p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 flex items-center gap-1">
                <Shield className="w-3 h-3 text-amber-600" />
                Super Admin Access Only
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              User Accounts & Access Control
            </h1>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 max-w-2xl">
              Controlled account provisioning model. The Super Admin creates accounts for coaches, staff, and students with strict Firebase Authentication credentials and role-based access.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="refresh-users-btn"
              onClick={fetchAllData}
              disabled={isLoading}
              className="p-2.5 rounded-2xl border-2 border-slate-900 dark:border-white bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-neutral-700 transition-all shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)] active:translate-x-0.5 active:translate-y-0.5"
              title="Refresh Users"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              id="create-account-btn"
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-xs tracking-tight border-2 border-slate-900 dark:border-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.1)] hover:bg-slate-800 dark:hover:bg-slate-100 transition-all active:translate-x-0.5 active:translate-y-0.5"
            >
              <UserPlus className="w-4 h-4" />
              <span>Create Account</span>
            </button>
          </div>
        </div>

        {/* Quick Bento Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t-2 border-slate-100 dark:border-neutral-800">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Accounts</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">{totalUsers}</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider block">Super Admins</span>
            <span className="text-xl font-black text-amber-900 dark:text-amber-200">{totalSuperAdmins}</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
            <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider block">Admins</span>
            <span className="text-xl font-black text-purple-900 dark:text-purple-200">{totalAdmins}</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider block">Coaches</span>
            <span className="text-xl font-black text-blue-900 dark:text-blue-200">{totalCoaches}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-800 rounded-3xl p-4 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.05)] flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="search-user-input"
            type="text"
            placeholder="Search by name, username, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {/* Role Filter Chips */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-neutral-800 p-1 rounded-2xl border border-slate-200 dark:border-neutral-700">
            {['ALL', 'SUPER_ADMIN', 'ADMIN', 'COACH'].map((role) => (
              <button
                key={role}
                id={`filter-role-${role}`}
                onClick={() => setSelectedRoleFilter(role)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-black tracking-tight transition-all whitespace-nowrap ${
                  selectedRoleFilter === role
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {role === 'ALL' ? 'All Roles' : role === 'SUPER_ADMIN' ? 'Super Admins' : role === 'ADMIN' ? 'Admins' : 'Coaches'}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <select
            id="filter-status-select"
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-800 rounded-3xl overflow-hidden shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)]">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-slate-900 dark:border-white border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Loading accounts...</p>
          </div>
        ) : fetchError ? (
          <div className="py-16 px-6 text-center space-y-4 bg-rose-50/30 dark:bg-rose-950/20">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center border-2 border-rose-200 dark:border-rose-800 shadow-xs">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <p className="text-base font-black text-rose-900 dark:text-rose-200">Unable to load user accounts</p>
              <p className="text-xs text-rose-700 dark:text-rose-300 font-bold">{fetchError}</p>
            </div>
            <button
              type="button"
              onClick={fetchAllData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Request</span>
            </button>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Users className="w-10 h-10 mx-auto text-slate-400" />
            <p className="text-base font-bold text-slate-900 dark:text-white">No accounts found</p>
            <p className="text-xs text-slate-500">Try adjusting your search query or filter settings.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-neutral-800/80 border-b-2 border-slate-900 dark:border-neutral-800 text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  <th className="py-3 px-4">Account Holder</th>
                  <th className="py-3 px-4">Username & Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Linked Profile</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-neutral-800 text-xs font-medium text-slate-900 dark:text-slate-100">
                {filteredUsers.map((user) => {
                  const isCurrentUser = user.id === currentUser?.id;
                  const isSuper = user.role === 'SUPER_ADMIN';
                  const isAdmin = user.role === 'ADMIN';
                  const isCoach = user.role === 'COACH';

                  return (
                    <tr
                      key={user.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-neutral-800/40 transition-colors ${
                        !user.is_active ? 'opacity-60 bg-slate-50/50 dark:bg-neutral-900/50' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-2xl flex items-center justify-center font-black text-xs border-2 ${
                              isSuper
                                ? 'bg-amber-100 text-amber-900 border-amber-500 dark:bg-amber-950 dark:text-amber-300'
                                : isAdmin
                                ? 'bg-purple-100 text-purple-900 border-purple-500 dark:bg-purple-950 dark:text-purple-300'
                                : 'bg-blue-100 text-blue-900 border-blue-500 dark:bg-blue-950 dark:text-blue-300'
                            }`}
                          >
                            {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <span className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                              {user.name}
                              {isCurrentUser && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                                  You
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] text-slate-500 block">
                              Joined {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <div className="font-mono text-[11px] font-bold text-slate-900 dark:text-white">
                            @{user.username || user.email.split('@')[0]}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {user.email}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {isSuper && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                            <Shield className="w-3 h-3 text-amber-600" />
                            SUPER ADMIN
                          </span>
                        )}
                        {isAdmin && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black bg-purple-100 text-purple-900 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-300 dark:border-purple-700">
                            <Shield className="w-3 h-3 text-purple-600" />
                            ADMIN
                          </span>
                        )}
                        {isCoach && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black bg-blue-100 text-blue-900 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
                            <Briefcase className="w-3 h-3 text-blue-600" />
                            COACH
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {user.coach_profile ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                            <span
                              className="w-2.5 h-2.5 rounded-full inline-block"
                              style={{ backgroundColor: user.coach_profile.color || '#3b82f6' }}
                            />
                            <span>{user.coach_profile.name}</span>
                          </div>
                        ) : user.student_profile ? (
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {user.student_profile.student_id} - {user.student_profile.full_name}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">None (Direct user)</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <button
                          id={`toggle-status-${user.id}`}
                          onClick={() => handleToggleStatus(user)}
                          disabled={isCurrentUser}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-xl text-[11px] font-black transition-all ${
                            user.is_active
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-200'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 hover:bg-rose-200'
                          }`}
                          title={isCurrentUser ? 'Cannot modify self status' : 'Click to toggle active status'}
                        >
                          {user.is_active ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Active
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-rose-600" />
                              Inactive
                            </>
                          )}
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            id={`reset-pwd-${user.id}`}
                            onClick={() => {
                              setResetPasswordUser(user);
                              setNewPassword('');
                            }}
                            className="p-1.5 rounded-xl bg-slate-100 dark:bg-neutral-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-slate-700 dark:text-slate-300 hover:text-amber-700 transition-all"
                            title="Reset Firebase Auth Password"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>

                          <button
                            id={`edit-user-${user.id}`}
                            onClick={() => openEditModal(user)}
                            className="p-1.5 rounded-xl bg-slate-100 dark:bg-neutral-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-slate-700 dark:text-slate-300 hover:text-blue-700 transition-all"
                            title="Edit Account Details"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {!isCurrentUser && (
                            <button
                              id={`delete-user-${user.id}`}
                              onClick={() => setDeletingUser(user)}
                              className="p-1.5 rounded-xl bg-slate-100 dark:bg-neutral-800 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-slate-700 dark:text-slate-300 hover:text-rose-700 transition-all"
                              title="Delete Account"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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

      {/* CREATE ACCOUNT MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-white rounded-3xl max-w-lg w-full p-6 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.15)] space-y-5">
            <div className="flex items-center justify-between pb-3 border-b-2 border-slate-100 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Create New Account</h3>
                  <p className="text-xs text-slate-500">Super Admin provisioned credential</p>
                </div>
              </div>
              <button
                id="close-create-modal"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
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
                      onClick={() => setFormData({ ...formData, role: r })}
                      className={`py-2 px-2 rounded-2xl text-[11px] font-black border-2 transition-all ${
                        formData.role === r
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs'
                          : 'bg-slate-50 dark:bg-neutral-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-neutral-700'
                      }`}
                    >
                      {r === 'COACH' ? 'Coach' : r === 'ADMIN' ? 'Admin' : 'Super Admin'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Full Name *
                  </label>
                  <input
                    id="new-user-name"
                    type="text"
                    required
                    placeholder="e.g. Wei Yuan"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Username / Handle *
                  </label>
                  <input
                    id="new-user-username"
                    type="text"
                    required
                    placeholder="e.g. coachweiyuan"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '') })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Firebase Auth Email *
                </label>
                <input
                  id="new-user-email"
                  type="email"
                  required
                  placeholder="e.g. weiyuan@academy.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Initial Password * (Managed by Firebase Auth)
                </label>
                <div className="relative">
                  <input
                    id="new-user-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Minimum 6 characters"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Profile Link Option */}
              {formData.role === 'COACH' && (
                <div className="space-y-1.5 p-3 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                  <label className="text-xs font-black uppercase tracking-wider text-blue-900 dark:text-blue-300">
                    Link to Coach Profile
                  </label>
                  <select
                    id="new-user-coach-link"
                    value={formData.coach_id}
                    onChange={(e) => setFormData({ ...formData, coach_id: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="">-- Select Coach (Optional) --</option>
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-2xl text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  id="submit-create-user-btn"
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black text-xs border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:bg-slate-800 transition-all active:translate-x-0.5 active:translate-y-0.5"
                >
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Save & Provision</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ACCOUNT MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-white rounded-3xl max-w-lg w-full p-6 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.15)] space-y-5">
            <div className="flex items-center justify-between pb-3 border-b-2 border-slate-100 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Edit Account</h3>
                  <p className="text-xs text-slate-500">{editingUser.email}</p>
                </div>
              </div>
              <button
                id="close-edit-modal"
                onClick={() => setEditingUser(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Role Assignment
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['COACH', 'ADMIN', 'SUPER_ADMIN'] as UserRole[]).map((r) => (
                    <button
                      type="button"
                      key={r}
                      id={`edit-role-${r}`}
                      onClick={() => setFormData({ ...formData, role: r })}
                      className={`py-2 px-2 rounded-2xl text-[11px] font-black border-2 transition-all ${
                        formData.role === r
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs'
                          : 'bg-slate-50 dark:bg-neutral-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-neutral-700'
                      }`}
                    >
                      {r === 'COACH' ? 'Coach' : r === 'ADMIN' ? 'Admin' : 'Super Admin'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Full Name
                  </label>
                  <input
                    id="edit-user-name"
                    type="text"
                    required
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Username / Handle
                  </label>
                  <input
                    id="edit-user-username"
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '') })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Email
                </label>
                <input
                  id="edit-user-email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>

              {/* Status Toggle */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Account Status</span>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                  className={`px-3 py-1 rounded-xl text-xs font-black transition-all ${
                    formData.is_active
                      ? 'bg-emerald-500 text-white'
                      : 'bg-rose-500 text-white'
                  }`}
                >
                  {formData.is_active ? 'Active' : 'Disabled'}
                </button>
              </div>

              {/* Profile Link Option */}
              {formData.role === 'COACH' && (
                <div className="space-y-1.5 p-3 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                  <label className="text-xs font-black uppercase tracking-wider text-blue-900 dark:text-blue-300">
                    Link to Coach Profile
                  </label>
                  <select
                    id="edit-user-coach-link"
                    value={formData.coach_id}
                    onChange={(e) => setFormData({ ...formData, coach_id: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="">-- None (Standalone User) --</option>
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-2xl text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  id="submit-edit-user-btn"
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black text-xs border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:bg-slate-800 transition-all active:translate-x-0.5 active:translate-y-0.5"
                >
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-white rounded-3xl max-w-md w-full p-6 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.15)] space-y-5">
            <div className="flex items-center justify-between pb-3 border-b-2 border-slate-100 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-2xl bg-amber-500 text-white">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Reset Password</h3>
                  <p className="text-xs text-slate-500">{resetPasswordUser.name} (@{resetPasswordUser.username || resetPasswordUser.email})</p>
                </div>
              </div>
              <button
                id="close-reset-pwd-modal"
                onClick={() => setResetPasswordUser(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs font-medium text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  This updates the password directly in Firebase Authentication via Firebase Admin SDK. Passwords are never saved in Firestore or stored as plaintext.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  New Password *
                </label>
                <div className="relative">
                  <input
                    id="reset-new-password-input"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Enter new password (min 6 chars)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setResetPasswordUser(null)}
                  className="px-4 py-2 rounded-2xl text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  id="submit-reset-pwd-btn"
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-500 text-slate-950 font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:bg-amber-400 transition-all active:translate-x-0.5 active:translate-y-0.5"
                >
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  <span>Set New Password</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-white rounded-3xl max-w-sm w-full p-6 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.15)] space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 mx-auto flex items-center justify-center border-2 border-rose-500">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Delete Account?</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Are you sure you want to permanently remove <strong className="text-slate-900 dark:text-white">{deletingUser.name}</strong> ({deletingUser.email})? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 rounded-2xl text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                id="confirm-delete-user-btn"
                onClick={handleDeleteUser}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-rose-600 text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:bg-rose-700 transition-all active:translate-x-0.5 active:translate-y-0.5"
              >
                {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Delete Account</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
