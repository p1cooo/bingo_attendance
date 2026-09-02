import React, { useState } from 'react';
import { Header } from '../common/Header.js';
import { DashboardView } from './DashboardView.js';
import { StudentsView } from './StudentsView.js';
import { CoachesView } from './CoachesView.js';
import { ClassesAndSchedulesView } from './ClassesAndSchedulesView.js';
import { SessionsView } from './SessionsView.js';
import { AttendanceManagementView } from './AttendanceManagementView.js';
import { MonthlyReportsView } from './MonthlyReportsView.js';
import { SettingsView } from './SettingsView.js';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileBarChart,
  Settings,
} from 'lucide-react';

export const AdminWorkspace: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  // Deep linking / quick actions between tabs
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isAddCoachOpen, setIsAddCoachOpen] = useState(false);
  const [isCreateScheduleOpen, setIsCreateScheduleOpen] = useState(false);
  const [inspectedSessionId, setInspectedSessionId] = useState<string | null>(null);

  const handleSelectSessionToInspect = (sessionId: string) => {
    setInspectedSessionId(sessionId);
    setActiveTab('attendance');
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'coaches', label: 'Coaches', icon: UserCheck },
    { id: 'classes', label: 'Classes & Schedules', icon: BookOpen },
    { id: 'sessions', label: 'Sessions', icon: CalendarDays },
    { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
    { id: 'reports', label: 'Reports', icon: FileBarChart },
    { id: 'settings', label: 'Rules & Logs', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#fdfdfd] dark:bg-neutral-950 transition-colors pb-16">
      <Header workspaceTitle="Admin Management Portal" />

      {/* Bento Navigation Bar */}
      <div className="border-b-2 border-slate-900 dark:border-neutral-800 bg-white dark:bg-neutral-900 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1.5 overflow-x-auto py-2.5 no-scrollbar">
            {navItems.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  id={`admin-nav-${id}`}
                  onClick={() => {
                    setActiveTab(id);
                    if (id !== 'attendance') {
                      setInspectedSessionId(null);
                    }
                  }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-black tracking-tight whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            onNavigate={(tab) => setActiveTab(tab)}
            onOpenAddStudent={() => {
              setActiveTab('students');
              setIsAddStudentOpen(true);
            }}
            onOpenAddCoach={() => {
              setActiveTab('coaches');
              setIsAddCoachOpen(true);
            }}
            onOpenCreateSchedule={() => {
              setActiveTab('classes');
              setIsCreateScheduleOpen(true);
            }}
            onSelectSession={handleSelectSessionToInspect}
          />
        )}

        {activeTab === 'students' && (
          <StudentsView
            initialAddModalOpen={isAddStudentOpen}
            onCloseInitialAddModal={() => setIsAddStudentOpen(false)}
          />
        )}

        {activeTab === 'coaches' && (
          <CoachesView
            initialAddModalOpen={isAddCoachOpen}
            onCloseInitialAddModal={() => setIsAddCoachOpen(false)}
          />
        )}

        {activeTab === 'classes' && (
          <ClassesAndSchedulesView
            initialCreateModalOpen={isCreateScheduleOpen}
            onCloseInitialCreateModal={() => setIsCreateScheduleOpen(false)}
          />
        )}

        {activeTab === 'sessions' && (
          <SessionsView onInspectSession={handleSelectSessionToInspect} />
        )}

        {activeTab === 'attendance' && (
          <AttendanceManagementView
            initialSessionId={inspectedSessionId}
            onClearInitialSession={() => setInspectedSessionId(null)}
          />
        )}

        {activeTab === 'reports' && <MonthlyReportsView />}

        {activeTab === 'settings' && <SettingsView />}
      </main>
    </div>
  );
};
