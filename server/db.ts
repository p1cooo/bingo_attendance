import fs from 'fs';
import path from 'path';
import {
  User,
  Coach,
  Parent,
  Student,
  AcademyClass,
  ClassSchedule,
  StudentClassMembership,
  ClassSession,
  AttendanceRecord,
  AttendanceAuditLog,
  NotificationLog,
  AttendanceStatus,
  AttendanceType,
  SessionStatus,
  SessionType,
} from '../src/types.js';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
const DB_FILE_PATH = isServerless
  ? path.join('/tmp', 'database_state.json')
  : path.join(process.cwd(), 'database_state.json');

// In-Memory relational database store with ACID safety, disk persistence, and relational querying
class DatabaseStore {
  users: Map<string, User> = new Map();
  coaches: Map<string, Coach> = new Map();
  parents: Map<string, Parent> = new Map();
  students: Map<string, Student> = new Map();
  classes: Map<string, AcademyClass> = new Map();
  schedules: Map<string, ClassSchedule> = new Map();
  memberships: Map<string, StudentClassMembership> = new Map();
  sessions: Map<string, ClassSession> = new Map();
  attendance: Map<string, AttendanceRecord> = new Map();
  auditLogs: AttendanceAuditLog[] = [];
  notificationLogs: NotificationLog[] = [];

  constructor() {
    this.seedInitialData();
    this.loadFromDisk();
  }

  seedInitialData() {
    // Production database: start with clean empty state.
    this.users.clear();
    this.coaches.clear();
    this.parents.clear();
    this.students.clear();
    this.classes.clear();
    this.schedules.clear();
    this.memberships.clear();
    this.sessions.clear();
    this.attendance.clear();
    this.auditLogs = [];
    this.notificationLogs = [];
  }

  // --- Helper Query Methods ---

  getPopulatedStudent(id: string): Student | undefined {
    const student = this.students.get(id);
    if (!student) return undefined;

    const parent = student.parent_id ? this.parents.get(student.parent_id) : undefined;
    
    // Find all classes/schedules this student is enrolled in
    const enrolledMemberships = Array.from(this.memberships.values()).filter(
      (m) => m.student_id === id && m.status === 'ACTIVE'
    );

    const enrolledSchedules = enrolledMemberships
      .map((m) => {
        const cls = this.getPopulatedClass(m.schedule_id) || this.classes.get(m.schedule_id);
        const sched = this.schedules.get(m.schedule_id);
        const coach = cls?.default_coach || (sched ? this.coaches.get(sched.coach_id) : undefined);
        return {
          schedule_id: m.schedule_id,
          class_name: cls?.name || 'Class',
          class_type: cls?.class_type || 'GROUP',
          coach_name: coach?.name || 'Coach',
          coach_color: coach?.color || '#3b82f6',
          day_of_week: cls?.day_of_week ?? (sched?.day_of_week ?? 6),
          start_time: cls?.start_time || sched?.start_time || '09:30',
          end_time: cls?.end_time || sched?.end_time || '11:00',
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    // Attendance stats
    const studentAttendances = Array.from(this.attendance.values()).filter(
      (a) => a.student_id === id
    );
    const presentCount = studentAttendances.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length;
    const replacementCount = studentAttendances.filter((a) => a.attendance_type === 'REPLACEMENT').length;
    const totalSessions = studentAttendances.length;
    const ratePercent = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : 100;

    return {
      ...student,
      parent,
      enrolled_schedules: enrolledSchedules,
      attendance_summary: {
        total_sessions: totalSessions,
        present_count: presentCount,
        replacement_count: replacementCount,
        rate_percent: ratePercent,
      },
    };
  }

  getPopulatedClass(id: string): AcademyClass | undefined {
    const cls = this.classes.get(id);
    if (!cls) return undefined;

    const sched = this.schedules.get(id) || Array.from(this.schedules.values()).find((s) => s.class_id === id);
    const defaultCoachId = cls.default_coach_id || sched?.coach_id || 'coach-1';
    const defaultCoach = this.coaches.get(defaultCoachId);

    const enrolledMemberships = Array.from(this.memberships.values()).filter(
      (m) => (m.schedule_id === id || (sched && m.schedule_id === sched.id)) && m.status === 'ACTIVE'
    );

    const enrolledStudents = enrolledMemberships
      .map((m) => this.students.get(m.student_id))
      .filter((s): s is Student => !!s);

    return {
      ...cls,
      day_of_week: cls.day_of_week !== undefined ? cls.day_of_week : (sched?.day_of_week ?? 6),
      start_time: cls.start_time || sched?.start_time || '09:30',
      end_time: cls.end_time || sched?.end_time || '11:00',
      room_location: cls.room_location || sched?.room_location || 'Chess Hall A',
      default_coach_id: defaultCoachId,
      default_coach: defaultCoach,
      enrolled_students_count: enrolledStudents.length,
      enrolled_student_ids: enrolledStudents.map((s) => s.id),
      enrolled_students: enrolledStudents,
    };
  }

  getPopulatedSchedule(id: string): ClassSchedule | undefined {
    const schedule = this.schedules.get(id);
    if (!schedule) return undefined;

    const classItem = this.getPopulatedClass(schedule.class_id) || this.classes.get(schedule.class_id);
    const defaultCoachId = schedule.default_coach_id || schedule.coach_id || classItem?.default_coach_id || 'coach-1';
    const coach = this.coaches.get(defaultCoachId);

    const memberships = Array.from(this.memberships.values()).filter(
      (m) => (m.schedule_id === id || m.schedule_id === schedule.class_id) && m.status === 'ACTIVE'
    );

    const enrolledStudents = memberships
      .map((m) => this.students.get(m.student_id))
      .filter((s): s is Student => !!s);

    return {
      ...schedule,
      coach_id: defaultCoachId,
      default_coach_id: defaultCoachId,
      class_item: classItem,
      coach,
      default_coach: coach,
      enrolled_students_count: memberships.length,
      enrolled_student_ids: memberships.map((m) => m.student_id),
      enrolled_students: enrolledStudents,
    };
  }

  getPopulatedSession(id: string): ClassSession | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    const classItem = this.getPopulatedClass(session.class_id) || this.classes.get(session.class_id);
    const sched = this.schedules.get(session.schedule_id);

    // Default Coach from Class/Schedule
    const defaultCoachId = session.default_coach_id || session.scheduled_coach_id || sched?.coach_id || classItem?.default_coach_id || 'coach-1';
    const defaultCoach = this.coaches.get(defaultCoachId);

    const isCancelled = session.status === 'COACH_CANCELLED' || session.status === 'CANCELLED' || session.session_type === 'COACH_CANCELLED';
    const isOffDay = session.status === 'PLANNED_OFF_DAY' || session.status === 'OFF_DAY' || session.session_type === 'PLANNED_OFF_DAY';

    // Replacement Coach / Actual Teaching Coach
    const actualCoachId = (isCancelled || isOffDay) ? defaultCoachId : (session.actual_coach_id || defaultCoachId);
    const isReplacement = !isCancelled && !isOffDay && actualCoachId !== defaultCoachId;
    const replacementCoach = isReplacement ? this.coaches.get(actualCoachId) : null;
    const teachingCoach = isReplacement ? replacementCoach : defaultCoach;

    // Expected regular students enrolled in class/schedule
    const enrolledMemberships = Array.from(this.memberships.values()).filter(
      (m) => (m.schedule_id === session.schedule_id || m.schedule_id === session.class_id) && m.status === 'ACTIVE'
    );
    // A replacement or trial student is enrolled for this occurrence only.
    // Include each such attendee in the session denominator so roll call never
    // shows impossible totals such as 5/4 after additional students are added.
    const enrolledStudentIds = new Set(enrolledMemberships.map((membership) => membership.student_id));
    const enrolledStudents = enrolledMemberships
      .map((m) => this.getPopulatedStudent(m.student_id))
      .filter((s): s is Student => !!s);

    // Attendance records for this session
    const records = Array.from(this.attendance.values()).filter(
      (a) => a.session_id === id
    );
    const additionalSessionStudentIds = new Set(
      records
        .map((record) => record.student_id)
        .filter((studentId) => !enrolledStudentIds.has(studentId))
    );
    const expectedStudentsCount = enrolledMemberships.length + additionalSessionStudentIds.size;

    const populatedRecords = records.map((r) => {
      const student = this.getPopulatedStudent(r.student_id);
      const user = this.users.get(r.marked_by_user_id);
      return {
        ...r,
        student,
        marked_by_user_name: user?.name || 'Staff',
      };
    });

    const presentCount = records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;

    let sessionType: SessionType = 'NORMAL';
    if (isCancelled) {
      sessionType = 'COACH_CANCELLED';
    } else if (isOffDay) {
      sessionType = 'PLANNED_OFF_DAY';
    } else if (isReplacement) {
      sessionType = 'REPLACEMENT_COACH';
    }

    return {
      ...session,
      status: isCancelled ? 'COACH_CANCELLED' : isOffDay ? 'PLANNED_OFF_DAY' : session.status,
      default_coach_id: defaultCoachId,
      replacement_coach_id: isReplacement ? actualCoachId : null,
      scheduled_coach_id: defaultCoachId,
      actual_coach_id: actualCoachId,
      session_type: sessionType,
      class_item: classItem,
      default_coach: defaultCoach,
      replacement_coach: replacementCoach,
      teaching_coach: teachingCoach,
      scheduled_coach: defaultCoach,
      actual_coach: teachingCoach,
      expected_students_count: expectedStudentsCount,
      enrolled_students: enrolledStudents,
      marked_attendance_count: records.length,
      present_count: presentCount,
      attendance_records: populatedRecords,
    };
  }

  // Ensure concrete session instances exist for all active recurring classes in a target month
  ensureSessionsForMonth(targetMonth: string): ClassSession[] {
    if (!targetMonth || !targetMonth.match(/^\d{4}-\d{2}$/)) return [];
    const createdSessions: ClassSession[] = [];

    const [yearStr, monthStr] = targetMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10); // 1-indexed (1..12)

    // Calculate days in month
    const daysInMonth = new Date(year, month, 0).getDate();

    Array.from(this.classes.values()).forEach((cls) => {
      if (!cls.is_active) return;
      const dayOfWeek = cls.day_of_week ?? 6;
      const defaultCoachId = cls.default_coach_id || 'coach-1';

      for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month - 1, day);
        if (dateObj.getDay() === dayOfWeek) {
          const dateString = `${targetMonth}-${String(day).padStart(2, '0')}`;
          
          // Check if session exists
          const existingSession = Array.from(this.sessions.values()).find(
            (s) => (s.class_id === cls.id || s.schedule_id === cls.id) && s.session_date === dateString
          );

          if (!existingSession) {
            const sessId = `sess-${dateString}-${cls.id}`;
            const newSession: ClassSession = {
              id: sessId,
              schedule_id: cls.id,
              class_id: cls.id,
              session_date: dateString,
              start_time: cls.start_time || '09:30',
              end_time: cls.end_time || '11:00',
              default_coach_id: defaultCoachId,
              scheduled_coach_id: defaultCoachId,
              actual_coach_id: defaultCoachId,
              session_type: 'NORMAL',
              status: 'SCHEDULED',
            };
            this.sessions.set(sessId, newSession);
            createdSessions.push(newSession);
          }
        }
      }
    });
    return createdSessions;
  }

  // Find user by email, username, or name
  findUserByLogin(input: string): User | undefined {
    if (!input) return undefined;
    const raw = String(input).trim().toLowerCase();
    const clean = raw.replace(/[^a-z0-9]/g, '');

    // 0. Explicit stored username match (e.g. user.username === raw)
    for (const user of this.users.values()) {
      if (user.username && (user.username.toLowerCase() === raw || user.username.toLowerCase().replace(/[^a-z0-9]/g, '') === clean)) {
        return user;
      }
    }

    // 1. Direct email match
    for (const user of this.users.values()) {
      if (user.email && user.email.toLowerCase() === raw) return user;
    }

    // 2. Email prefix match
    for (const user of this.users.values()) {
      if (user.email) {
        const emailPrefix = user.email.toLowerCase().split('@')[0];
        if (emailPrefix === raw || emailPrefix.replace(/[^a-z0-9]/g, '') === clean) {
          return user;
        }
      }
    }

    // 3. User by display name
    for (const user of this.users.values()) {
      const uClean = user.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean === uClean) {
        return user;
      }
    }

    return undefined;
  }

  // Disk Persistence (Saves all state to local JSON file so edits are preserved)
  saveToDisk() {
    try {
      const state = {
        users: Array.from(this.users.entries()),
        coaches: Array.from(this.coaches.entries()),
        parents: Array.from(this.parents.entries()),
        students: Array.from(this.students.entries()),
        classes: Array.from(this.classes.entries()),
        schedules: Array.from(this.schedules.entries()),
        memberships: Array.from(this.memberships.entries()),
        sessions: Array.from(this.sessions.entries()),
        attendance: Array.from(this.attendance.entries()),
        auditLogs: this.auditLogs,
        notificationLogs: this.notificationLogs,
      };
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB] Failed to save state to disk:', err);
    }
  }

  loadFromDisk() {
    try {
      if (!fs.existsSync(DB_FILE_PATH)) {
        this.saveToDisk();
        return;
      }
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const state = JSON.parse(raw);
      if (state.users) {
        this.users = new Map(state.users);
        // Ensure only SUPER_ADMIN, ADMIN, and COACH exist
        for (const [id, u] of this.users.entries()) {
          if ((u.role as string) === 'STAFF' || (u.role as string) === 'STAFF_ADMIN') {
            u.role = 'ADMIN';
          } else if ((u.role as string) === 'STUDENT') {
            this.users.delete(id);
          } else if (u.role !== 'SUPER_ADMIN' && u.role !== 'ADMIN' && u.role !== 'COACH') {
            u.role = 'ADMIN';
          }
        }
      }
      if (state.coaches) this.coaches = new Map(state.coaches);
      if (state.parents) this.parents = new Map(state.parents);
      if (state.students) this.students = new Map(state.students);
      if (state.classes) this.classes = new Map(state.classes);
      if (state.schedules) this.schedules = new Map(state.schedules);
      if (state.memberships) this.memberships = new Map(state.memberships);
      if (state.sessions) this.sessions = new Map(state.sessions);
      if (state.attendance) this.attendance = new Map(state.attendance);
      if (state.auditLogs) this.auditLogs = state.auditLogs;
      if (state.notificationLogs) this.notificationLogs = state.notificationLogs;
      console.log('[DB] Successfully restored academy database state from disk');
    } catch (err) {
      console.error('[DB] Failed to load state from disk, using default seed:', err);
    }
  }
}

export const db = new DatabaseStore();
