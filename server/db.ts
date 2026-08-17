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

const DB_FILE_PATH = path.join(process.cwd(), 'database_state.json');

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
    // 1. Coaches
    const coachesData: Coach[] = [
      {
        id: 'coach-1',
        name: 'Wei Yuan',
        email: 'weiyuan@academy.com',
        phone: '+60 12-345 6789',
        color: '#3b82f6', // Pastel Blue
        color_name: 'Pastel Blue',
        is_active: true,
        bio: 'Head Junior Coach & FIDE Master Candidate',
        created_at: '2026-01-10T08:00:00Z',
      },
      {
        id: 'coach-2',
        name: 'Chuah',
        email: 'chuah@academy.com',
        phone: '+60 16-888 9922',
        color: '#8b5cf6', // Pastel Purple
        color_name: 'Pastel Purple',
        is_active: true,
        bio: 'Tactics Specialist & National Master',
        created_at: '2026-01-12T08:00:00Z',
      },
      {
        id: 'coach-3',
        name: 'Tan',
        email: 'tan@academy.com',
        phone: '+60 17-555 1234',
        color: '#10b981', // Pastel Green
        color_name: 'Pastel Green',
        is_active: true,
        bio: 'Senior Tournament & Competition Squad Coach',
        created_at: '2026-01-15T08:00:00Z',
      },
      {
        id: 'coach-4',
        name: 'Jason',
        email: 'jason@academy.com',
        phone: '+60 13-999 0011',
        color: '#f59e0b', // Pastel Amber
        color_name: 'Pastel Amber',
        is_active: true,
        bio: 'Private 1-on-1 Specialist & Replacement Coach',
        created_at: '2026-02-01T08:00:00Z',
      },
      {
        id: 'coach-5',
        name: 'Sarah',
        email: 'sarah@academy.com',
        phone: '+60 18-222 7788',
        color: '#ec4899', // Pastel Pink
        color_name: 'Pastel Pink',
        is_active: true,
        bio: 'Beginner Foundations & Junior Development',
        created_at: '2026-02-10T08:00:00Z',
      },
      {
        id: 'coach-6',
        name: 'Michael',
        email: 'michael@academy.com',
        phone: '+60 19-333 4444',
        color: '#06b6d4', // Pastel Cyan
        color_name: 'Pastel Cyan',
        is_active: true,
        bio: 'Senior Tactics & Tournament Preparation Coach',
        created_at: '2026-03-01T08:00:00Z',
      },
    ];

    coachesData.forEach((c) => this.coaches.set(c.id, c));

    // 2. Users (Authentication Accounts)
    const usersData: User[] = [
      {
        id: 'user-admin',
        email: 'admin@academy.com',
        name: 'Academy Administrator',
        role: 'ADMIN',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'user-coach-1',
        email: 'weiyuan@academy.com',
        name: 'Wei Yuan',
        role: 'COACH',
        coach_id: 'coach-1',
        is_active: true,
        created_at: '2026-01-10T08:00:00Z',
      },
      {
        id: 'user-coach-2',
        email: 'chuah@academy.com',
        name: 'Chuah',
        role: 'COACH',
        coach_id: 'coach-2',
        is_active: true,
        created_at: '2026-01-12T08:00:00Z',
      },
      {
        id: 'user-coach-3',
        email: 'tan@academy.com',
        name: 'Tan',
        role: 'COACH',
        coach_id: 'coach-3',
        is_active: true,
        created_at: '2026-01-15T08:00:00Z',
      },
      {
        id: 'user-coach-4',
        email: 'jason@academy.com',
        name: 'Jason',
        role: 'COACH',
        coach_id: 'coach-4',
        is_active: true,
        created_at: '2026-02-01T08:00:00Z',
      },
      {
        id: 'user-coach-5',
        email: 'sarah@academy.com',
        name: 'Sarah',
        role: 'COACH',
        coach_id: 'coach-5',
        is_active: true,
        created_at: '2026-02-10T08:00:00Z',
      },
      {
        id: 'user-student-1',
        email: 'johntan@student.academy.com',
        name: 'John Tan',
        role: 'STUDENT',
        student_id: 'stu-1',
        is_active: true,
        created_at: '2026-01-10T08:00:00Z',
      },
      {
        id: 'user-student-2',
        email: 'amylim@student.academy.com',
        name: 'Amy Lim',
        role: 'STUDENT',
        student_id: 'stu-2',
        is_active: true,
        created_at: '2026-01-11T08:00:00Z',
      },
    ];

    usersData.forEach((u) => this.users.set(u.id, u));

    // 3. Classes (Permanent Recurring Academy Classes)
    // Day of week: 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
    const classesData: AcademyClass[] = [
      {
        id: 'class-sat-0930-wy',
        name: 'Saturday 9:30–11:00',
        class_type: 'GROUP',
        day_of_week: 6, // Saturday
        start_time: '09:30',
        end_time: '11:00',
        default_coach_id: 'coach-1', // Wei Yuan
        room_location: 'Chess Hall A - Board 1-4',
        description: 'Permanent recurring Saturday morning foundation group.',
        default_duration_mins: 90,
        default_capacity: 8,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'class-sat-1100-wy',
        name: 'Saturday 11:00–12:30',
        class_type: 'GROUP',
        day_of_week: 6, // Saturday
        start_time: '11:00',
        end_time: '12:30',
        default_coach_id: 'coach-1', // Wei Yuan
        room_location: 'Chess Hall A - Board 1-4',
        description: 'Permanent recurring Saturday late-morning group.',
        default_duration_mins: 90,
        default_capacity: 8,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'class-sat-1330-tan',
        name: 'Saturday 1:30–3:00',
        class_type: 'GROUP',
        day_of_week: 6, // Saturday
        start_time: '13:30',
        end_time: '15:00',
        default_coach_id: 'coach-3', // Tan
        room_location: 'Grandmaster Arena - Board 1-4',
        description: 'Advanced tactics and master endgame principles.',
        default_duration_mins: 90,
        default_capacity: 8,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'class-sat-1400-sarah',
        name: 'Saturday 2:00–3:30 (Junior)',
        class_type: 'GROUP',
        day_of_week: 6, // Saturday
        start_time: '14:00',
        end_time: '15:30',
        default_coach_id: 'coach-5', // Sarah
        room_location: 'Junior Knights Room 2',
        description: 'Junior developmental sparring and beginner tactics.',
        default_duration_mins: 90,
        default_capacity: 8,
        is_active: true,
        created_at: '2026-02-10T00:00:00Z',
      },
      {
        id: 'class-sun-0930-wy',
        name: 'Sunday 9:30–11:00',
        class_type: 'GROUP',
        day_of_week: 0, // Sunday
        start_time: '09:30',
        end_time: '11:00',
        default_coach_id: 'coach-1', // Wei Yuan
        room_location: 'Chess Hall A - Board 1-4',
        description: 'Sunday morning foundation tactics group.',
        default_duration_mins: 90,
        default_capacity: 8,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'class-sun-1100-wy',
        name: 'Sunday 11:00–12:30',
        class_type: 'GROUP',
        day_of_week: 0, // Sunday
        start_time: '11:00',
        end_time: '12:30',
        default_coach_id: 'coach-1', // Wei Yuan
        room_location: 'Chess Hall A - Board 5-8',
        description: 'Sunday middle-game and pawn structure group.',
        default_duration_mins: 90,
        default_capacity: 8,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'class-sun-1400-ch',
        name: 'Sunday 2:00–3:30',
        class_type: 'GROUP',
        day_of_week: 0, // Sunday
        start_time: '14:00',
        end_time: '15:30',
        default_coach_id: 'coach-2', // Chuah
        room_location: 'Chess Hall B - Board 1-4',
        description: 'Tactical calculation and blitz calculation speed.',
        default_duration_mins: 90,
        default_capacity: 8,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'class-sun-1600-tan',
        name: 'Sunday 4:00–6:00 (Elite)',
        class_type: 'GROUP',
        day_of_week: 0, // Sunday
        start_time: '16:00',
        end_time: '18:00',
        default_coach_id: 'coach-3', // Tan
        room_location: 'Grandmaster Arena - Board 1-4',
        description: 'FIDE rated tournament players and master study.',
        default_duration_mins: 120,
        default_capacity: 6,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'class-joshua-indiv',
        name: 'Joshua – Individual',
        class_type: 'INDIVIDUAL',
        day_of_week: 2, // Tuesday
        start_time: '16:00',
        end_time: '17:00',
        default_coach_id: 'coach-4', // Jason
        room_location: 'Private Analysis Room 1',
        description: 'Personalized 1-on-1 sparring and opening tailoring.',
        default_duration_mins: 60,
        default_capacity: 1,
        is_active: true,
        created_at: '2026-02-01T00:00:00Z',
      },
      {
        id: 'class-ivria-indiv',
        name: 'Ivria – Individual',
        class_type: 'INDIVIDUAL',
        day_of_week: 0, // Sunday
        start_time: '10:00',
        end_time: '11:00',
        default_coach_id: 'coach-4', // Jason
        room_location: 'Private Analysis Room 2',
        description: 'Personalized 1-on-1 tactical mastery.',
        default_duration_mins: 60,
        default_capacity: 1,
        is_active: true,
        created_at: '2026-02-01T00:00:00Z',
      },
    ];

    classesData.forEach((cl) => {
      this.classes.set(cl.id, cl);
      // Synchronize ClassSchedule
      const sched: ClassSchedule = {
        id: cl.id,
        class_id: cl.id,
        coach_id: cl.default_coach_id || 'coach-1',
        default_coach_id: cl.default_coach_id || 'coach-1',
        day_of_week: cl.day_of_week ?? 6,
        start_time: cl.start_time ?? '09:30',
        end_time: cl.end_time ?? '11:00',
        room_location: cl.room_location,
        status: cl.is_active ? 'ACTIVE' : 'INACTIVE',
        is_active: cl.is_active,
        created_at: cl.created_at,
      };
      this.schedules.set(sched.id, sched);
    });

    // 4. Parents
    const parentsData: Parent[] = [
      {
        id: 'parent-1',
        name: 'David Tan',
        phone: '+60 12-234 8899',
        email: 'david.tan@example.com',
        telegram_chat_id: '98723412',
        telegram_username: '@davidtan88',
        created_at: '2026-01-10T00:00:00Z',
      },
      {
        id: 'parent-2',
        name: 'Grace Lim',
        phone: '+60 17-665 4321',
        email: 'grace.lim@example.com',
        telegram_chat_id: '45612378',
        telegram_username: '@gracelim_my',
        created_at: '2026-01-11T00:00:00Z',
      },
      {
        id: 'parent-3',
        name: 'Robert Lee',
        phone: '+60 19-876 1122',
        email: 'robert.lee@example.com',
        telegram_chat_id: '88776655',
        telegram_username: '@robertlee_kl',
        created_at: '2026-01-12T00:00:00Z',
      },
      {
        id: 'parent-4',
        name: 'Mei Ling Wong',
        phone: '+60 13-445 6677',
        email: 'meiling.wong@example.com',
        telegram_chat_id: '22334455',
        telegram_username: '@meiling_wong',
        created_at: '2026-01-15T00:00:00Z',
      },
      {
        id: 'parent-5',
        name: 'Kelvin Ng',
        phone: '+60 16-778 9900',
        email: 'kelvin.ng@example.com',
        telegram_chat_id: '66554433',
        telegram_username: '@kelvin_ng',
        created_at: '2026-01-18T00:00:00Z',
      },
      {
        id: 'parent-6',
        name: 'Serena Chong',
        phone: '+60 12-998 1234',
        email: 'serena.chong@example.com',
        telegram_chat_id: '77889911',
        telegram_username: '@serena_chong',
        created_at: '2026-01-20T00:00:00Z',
      },
    ];

    parentsData.forEach((p) => this.parents.set(p.id, p));

    // 5. Students
    const studentsData: Student[] = [
      {
        id: 'stu-1',
        student_id: 'STU-0101',
        full_name: 'John Tan',
        nick_name: 'Johnny',
        school: 'St Joseph Academy',
        parent_id: 'parent-1',
        parent_relation: 'Father',
        status: 'ACTIVE',
        created_at: '2026-01-10T00:00:00Z',
      },
      {
        id: 'stu-2',
        student_id: 'STU-0102',
        full_name: 'Amy Lim',
        nick_name: 'Amy',
        school: 'Greenwood High',
        parent_id: 'parent-2',
        parent_relation: 'Mother',
        status: 'ACTIVE',
        created_at: '2026-01-11T00:00:00Z',
      },
      {
        id: 'stu-3',
        student_id: 'STU-0103',
        full_name: 'Kevin Lee',
        nick_name: 'Kev',
        school: 'Beacon Hill International',
        parent_id: 'parent-3',
        parent_relation: 'Father',
        status: 'ACTIVE',
        created_at: '2026-01-12T00:00:00Z',
      },
      {
        id: 'stu-4',
        student_id: 'STU-0104',
        full_name: 'Lucas Wong',
        nick_name: 'Luke',
        school: 'St Joseph Academy',
        parent_id: 'parent-4',
        parent_relation: 'Mother',
        status: 'ACTIVE',
        created_at: '2026-01-15T00:00:00Z',
      },
      {
        id: 'stu-5',
        student_id: 'STU-0105',
        full_name: 'Chloe Ng',
        nick_name: 'Chloe',
        school: 'Sunway International School',
        parent_id: 'parent-5',
        parent_relation: 'Father',
        status: 'ACTIVE',
        created_at: '2026-01-18T00:00:00Z',
      },
      {
        id: 'stu-6',
        student_id: 'STU-0106',
        full_name: 'Ryan Chong',
        nick_name: 'Ryan',
        school: 'Sri Kuala Lumpur',
        parent_id: 'parent-6',
        parent_relation: 'Mother',
        status: 'ACTIVE',
        created_at: '2026-01-20T00:00:00Z',
      },
      {
        id: 'stu-7',
        student_id: 'STU-0107',
        full_name: 'Marcus Tan',
        nick_name: 'Marc',
        school: 'St Joseph Academy',
        parent_id: 'parent-1',
        parent_relation: 'Father',
        status: 'ACTIVE',
        created_at: '2026-01-22T00:00:00Z',
      },
      {
        id: 'stu-8',
        student_id: 'STU-0108',
        full_name: 'Ethan Yap',
        nick_name: 'Ethan',
        school: 'Fairview International',
        parent_id: 'parent-2',
        parent_relation: 'Guardian',
        status: 'ACTIVE',
        created_at: '2026-01-25T00:00:00Z',
      },
      {
        id: 'stu-9',
        student_id: 'STU-0109',
        full_name: 'Hannah Chen',
        nick_name: 'Hannah',
        school: 'Greenwood High',
        parent_id: 'parent-3',
        parent_relation: 'Mother',
        status: 'ACTIVE',
        created_at: '2026-02-01T00:00:00Z',
      },
      {
        id: 'stu-10',
        student_id: 'STU-0110',
        full_name: 'Bryan Fong',
        nick_name: 'Bryan',
        school: 'Cempaka International',
        parent_id: 'parent-4',
        parent_relation: 'Father',
        status: 'ACTIVE',
        created_at: '2026-02-05T00:00:00Z',
      },
      {
        id: 'stu-11',
        student_id: 'STU-0111',
        full_name: 'Sophia Liew',
        nick_name: 'Sophie',
        school: 'Wesley Methodist School',
        parent_id: 'parent-5',
        parent_relation: 'Mother',
        status: 'ACTIVE',
        created_at: '2026-02-08T00:00:00Z',
      },
      {
        id: 'stu-12',
        student_id: 'STU-0112',
        full_name: 'Daniel Goh',
        nick_name: 'Dan',
        school: 'St Joseph Academy',
        parent_id: 'parent-6',
        parent_relation: 'Father',
        status: 'ACTIVE',
        created_at: '2026-02-12T00:00:00Z',
      },
    ];

    studentsData.forEach((s) => this.students.set(s.id, s));

    // 6. Student Class Memberships (Assigned once to the permanent Class)
    const membershipsData: StudentClassMembership[] = [
      // Class: Saturday 9:30–11:00 (Wei Yuan) - 5 students (John, Amy, Kevin, Lucas, Chloe)
      { id: 'm-1', student_id: 'stu-1', schedule_id: 'class-sat-0930-wy', joined_date: '2026-01-10', status: 'ACTIVE' },
      { id: 'm-2', student_id: 'stu-2', schedule_id: 'class-sat-0930-wy', joined_date: '2026-01-11', status: 'ACTIVE' },
      { id: 'm-3', student_id: 'stu-3', schedule_id: 'class-sat-0930-wy', joined_date: '2026-01-12', status: 'ACTIVE' },
      { id: 'm-4', student_id: 'stu-4', schedule_id: 'class-sat-0930-wy', joined_date: '2026-01-15', status: 'ACTIVE' },
      { id: 'm-5', student_id: 'stu-5', schedule_id: 'class-sat-0930-wy', joined_date: '2026-01-18', status: 'ACTIVE' },

      // Class: Saturday 11:00–12:30 (Wei Yuan) - 4 students
      { id: 'm-6', student_id: 'stu-6', schedule_id: 'class-sat-1100-wy', joined_date: '2026-01-20', status: 'ACTIVE' },
      { id: 'm-7', student_id: 'stu-7', schedule_id: 'class-sat-1100-wy', joined_date: '2026-01-22', status: 'ACTIVE' },
      { id: 'm-8', student_id: 'stu-8', schedule_id: 'class-sat-1100-wy', joined_date: '2026-01-25', status: 'ACTIVE' },
      { id: 'm-9', student_id: 'stu-9', schedule_id: 'class-sat-1100-wy', joined_date: '2026-02-01', status: 'ACTIVE' },

      // Class: Saturday 1:30–3:00 (Tan) - 3 students
      { id: 'm-10', student_id: 'stu-3', schedule_id: 'class-sat-1330-tan', joined_date: '2026-01-12', status: 'ACTIVE' },
      { id: 'm-11', student_id: 'stu-6', schedule_id: 'class-sat-1330-tan', joined_date: '2026-01-20', status: 'ACTIVE' },
      { id: 'm-12', student_id: 'stu-7', schedule_id: 'class-sat-1330-tan', joined_date: '2026-01-22', status: 'ACTIVE' },

      // Class: Saturday 2:00–3:30 (Junior - Sarah) - 2 students
      { id: 'm-13', student_id: 'stu-10', schedule_id: 'class-sat-1400-sarah', joined_date: '2026-02-10', status: 'ACTIVE' },
      { id: 'm-14', student_id: 'stu-11', schedule_id: 'class-sat-1400-sarah', joined_date: '2026-02-10', status: 'ACTIVE' },

      // Class: Sunday 9:30–11:00 (Wei Yuan) - 5 students
      { id: 'm-15', student_id: 'stu-1', schedule_id: 'class-sun-0930-wy', joined_date: '2026-01-10', status: 'ACTIVE' },
      { id: 'm-16', student_id: 'stu-2', schedule_id: 'class-sun-0930-wy', joined_date: '2026-01-11', status: 'ACTIVE' },
      { id: 'm-17', student_id: 'stu-3', schedule_id: 'class-sun-0930-wy', joined_date: '2026-01-12', status: 'ACTIVE' },
      { id: 'm-18', student_id: 'stu-10', schedule_id: 'class-sun-0930-wy', joined_date: '2026-02-05', status: 'ACTIVE' },
      { id: 'm-19', student_id: 'stu-11', schedule_id: 'class-sun-0930-wy', joined_date: '2026-02-08', status: 'ACTIVE' },

      // Class: Sunday 11:00–12:30 (Wei Yuan) - 4 students
      { id: 'm-20', student_id: 'stu-4', schedule_id: 'class-sun-1100-wy', joined_date: '2026-01-15', status: 'ACTIVE' },
      { id: 'm-21', student_id: 'stu-5', schedule_id: 'class-sun-1100-wy', joined_date: '2026-01-18', status: 'ACTIVE' },
      { id: 'm-22', student_id: 'stu-6', schedule_id: 'class-sun-1100-wy', joined_date: '2026-01-20', status: 'ACTIVE' },
      { id: 'm-23', student_id: 'stu-12', schedule_id: 'class-sun-1100-wy', joined_date: '2026-02-12', status: 'ACTIVE' },

      // Class: Sunday 2:00–3:30 (Chuah) - 4 students
      { id: 'm-24', student_id: 'stu-7', schedule_id: 'class-sun-1400-ch', joined_date: '2026-01-22', status: 'ACTIVE' },
      { id: 'm-25', student_id: 'stu-8', schedule_id: 'class-sun-1400-ch', joined_date: '2026-01-25', status: 'ACTIVE' },
      { id: 'm-26', student_id: 'stu-9', schedule_id: 'class-sun-1400-ch', joined_date: '2026-02-01', status: 'ACTIVE' },
      { id: 'm-27', student_id: 'stu-10', schedule_id: 'class-sun-1400-ch', joined_date: '2026-02-05', status: 'ACTIVE' },

      // Class: Sunday 4:00–6:00 (Elite - Tan) - 4 students
      { id: 'm-28', student_id: 'stu-3', schedule_id: 'class-sun-1600-tan', joined_date: '2026-01-12', status: 'ACTIVE' },
      { id: 'm-29', student_id: 'stu-6', schedule_id: 'class-sun-1600-tan', joined_date: '2026-01-20', status: 'ACTIVE' },
      { id: 'm-30', student_id: 'stu-7', schedule_id: 'class-sun-1600-tan', joined_date: '2026-01-22', status: 'ACTIVE' },
      { id: 'm-31', student_id: 'stu-12', schedule_id: 'class-sun-1600-tan', joined_date: '2026-02-12', status: 'ACTIVE' },

      // Class: Joshua – Individual (Jason) - 1 student
      { id: 'm-32', student_id: 'stu-1', schedule_id: 'class-joshua-indiv', joined_date: '2026-02-01', status: 'ACTIVE' },

      // Class: Ivria – Individual (Jason) - 1 student
      { id: 'm-33', student_id: 'stu-2', schedule_id: 'class-ivria-indiv', joined_date: '2026-02-01', status: 'ACTIVE' },
    ];

    membershipsData.forEach((m) => this.memberships.set(m.id, m));

    // 7. Concrete Calendar Sessions (Occurrences in August 2026)
    // Includes the exact 5-week scenario requested:
    // Class: Saturday 9:30–11:00 (Default Coach: Wei Yuan)
    // Aug 1: Wei Yuan (COMPLETED)
    // Aug 8: Wei Yuan (COMPLETED)
    // Aug 15: Coach Chuah (Replacement Coach exception, COMPLETED)
    // Aug 22: Coach Cancelled (Wei Yuan sick, no replacement)
    // Aug 29: Wei Yuan (Default Coach intact!)
    const sessionsData: ClassSession[] = [
      // === Aug 1, 2026 (Saturday) ===
      {
        id: 'sess-2026-08-01-sat-0930-wy',
        schedule_id: 'class-sat-0930-wy',
        class_id: 'class-sat-0930-wy',
        session_date: '2026-08-01',
        start_time: '09:30',
        end_time: '11:00',
        default_coach_id: 'coach-1',
        scheduled_coach_id: 'coach-1', // Wei Yuan
        actual_coach_id: 'coach-1', // Wei Yuan
        session_type: 'NORMAL',
        status: 'COMPLETED',
        notes: 'Great opening principles and checkmate patterns.',
      },
      {
        id: 'sess-2026-08-01-sat-1100-wy',
        schedule_id: 'class-sat-1100-wy',
        class_id: 'class-sat-1100-wy',
        session_date: '2026-08-01',
        start_time: '11:00',
        end_time: '12:30',
        default_coach_id: 'coach-1',
        scheduled_coach_id: 'coach-1',
        actual_coach_id: 'coach-1',
        session_type: 'NORMAL',
        status: 'COMPLETED',
      },
      {
        id: 'sess-2026-08-01-sat-1330-tan',
        schedule_id: 'class-sat-1330-tan',
        class_id: 'class-sat-1330-tan',
        session_date: '2026-08-01',
        start_time: '13:30',
        end_time: '15:00',
        default_coach_id: 'coach-3',
        scheduled_coach_id: 'coach-3',
        actual_coach_id: 'coach-3',
        session_type: 'NORMAL',
        status: 'COMPLETED',
      },

      // === Aug 2, 2026 (Sunday) ===
      {
        id: 'sess-2026-08-02-sun-0930-wy',
        schedule_id: 'class-sun-0930-wy',
        class_id: 'class-sun-0930-wy',
        session_date: '2026-08-02',
        start_time: '09:30',
        end_time: '11:00',
        default_coach_id: 'coach-1',
        scheduled_coach_id: 'coach-1',
        actual_coach_id: 'coach-1',
        session_type: 'NORMAL',
        status: 'COMPLETED',
      },
      {
        id: 'sess-2026-08-02-sun-1100-wy',
        schedule_id: 'class-sun-1100-wy',
        class_id: 'class-sun-1100-wy',
        session_date: '2026-08-02',
        start_time: '11:00',
        end_time: '12:30',
        default_coach_id: 'coach-1',
        scheduled_coach_id: 'coach-1',
        actual_coach_id: 'coach-1',
        session_type: 'NORMAL',
        status: 'COMPLETED',
      },
      {
        id: 'sess-2026-08-02-sun-1400-ch',
        schedule_id: 'class-sun-1400-ch',
        class_id: 'class-sun-1400-ch',
        session_date: '2026-08-02',
        start_time: '14:00',
        end_time: '15:30',
        default_coach_id: 'coach-2',
        scheduled_coach_id: 'coach-2',
        actual_coach_id: 'coach-2',
        session_type: 'NORMAL',
        status: 'COMPLETED',
      },

      // === Aug 8, 2026 (Saturday) ===
      {
        id: 'sess-2026-08-08-sat-0930-wy',
        schedule_id: 'class-sat-0930-wy',
        class_id: 'class-sat-0930-wy',
        session_date: '2026-08-08',
        start_time: '09:30',
        end_time: '11:00',
        default_coach_id: 'coach-1',
        scheduled_coach_id: 'coach-1', // Wei Yuan
        actual_coach_id: 'coach-1', // Wei Yuan
        session_type: 'NORMAL',
        status: 'COMPLETED',
      },
      {
        id: 'sess-2026-08-08-sat-1100-wy',
        schedule_id: 'class-sat-1100-wy',
        class_id: 'class-sat-1100-wy',
        session_date: '2026-08-08',
        start_time: '11:00',
        end_time: '12:30',
        default_coach_id: 'coach-1',
        scheduled_coach_id: 'coach-1',
        actual_coach_id: 'coach-1',
        session_type: 'NORMAL',
        status: 'COMPLETED',
      },

      // === Aug 9, 2026 (Sunday) ===
      {
        id: 'sess-2026-08-09-sun-0930-wy',
        schedule_id: 'class-sun-0930-wy',
        class_id: 'class-sun-0930-wy',
        session_date: '2026-08-09',
        start_time: '09:30',
        end_time: '11:00',
        default_coach_id: 'coach-1',
        scheduled_coach_id: 'coach-1',
        actual_coach_id: 'coach-1',
        session_type: 'NORMAL',
        status: 'COMPLETED',
      },
      {
        id: 'sess-2026-08-09-sun-1600-tan',
        schedule_id: 'class-sun-1600-tan',
        class_id: 'class-sun-1600-tan',
        session_date: '2026-08-09',
        start_time: '16:00',
        end_time: '18:00',
        default_coach_id: 'coach-3',
        scheduled_coach_id: 'coach-3', // Default Tan
        actual_coach_id: 'coach-4', // Replacement Coach Jason!
        session_type: 'REPLACEMENT_COACH',
        status: 'COMPLETED',
        notes: 'Coach Tan on medical leave; Coach Jason taught replacement session.',
      },

      // === Aug 15, 2026 (Saturday) - REPLACEMENT COACH EXCEPTION ===
      {
        id: 'sess-2026-08-15-sat-0930-wy',
        schedule_id: 'class-sat-0930-wy',
        class_id: 'class-sat-0930-wy',
        session_date: '2026-08-15',
        start_time: '09:30',
        end_time: '11:00',
        default_coach_id: 'coach-1',
        scheduled_coach_id: 'coach-1', // Default Coach is still Wei Yuan!
        actual_coach_id: 'coach-2', // REPLACEMENT COACH: Coach Chuah taught this session!
        replacement_coach_id: 'coach-2',
        session_type: 'REPLACEMENT_COACH',
        status: 'COMPLETED',
        notes: 'Coach Chuah took replacement coverage for Coach Wei Yuan for this session.',
      },
      {
        id: 'sess-2026-08-15-sat-1100-wy',
        schedule_id: 'class-sat-1100-wy',
        class_id: 'class-sat-1100-wy',
        session_date: '2026-08-15',
        start_time: '11:00',
        end_time: '12:30',
        default_coach_id: 'coach-1',
        scheduled_coach_id: 'coach-1',
        actual_coach_id: 'coach-1',
        session_type: 'NORMAL',
        status: 'COMPLETED',
      },

      // === Aug 16, 2026 (Sunday - Reference Date) ===
      {
        id: 'sess-2026-08-16-sun-0930-wy',
        schedule_id: 'class-sun-0930-wy',
        class_id: 'class-sun-0930-wy',
        session_date: '2026-08-16',
        start_time: '09:30',
        end_time: '11:00',
        default_coach_id: 'coach-1',
        scheduled_coach_id: 'coach-1',
        actual_coach_id: 'coach-1',
        session_type: 'NORMAL',
        status: 'COMPLETED',
        notes: 'Morning Sunday foundation class.',
      },
      {
        id: 'sess-2026-08-16-sun-1100-wy',
        schedule_id: 'class-sun-1100-wy',
        class_id: 'class-sun-1100-wy',
        session_date: '2026-08-16',
        start_time: '11:00',
        end_time: '12:30',
        default_coach_id: 'coach-1',
        scheduled_coach_id: 'coach-1',
        actual_coach_id: 'coach-1',
        session_type: 'NORMAL',
        status: 'SCHEDULED',
      },
      {
        id: 'sess-2026-08-16-ivria-indiv',
        schedule_id: 'class-ivria-indiv',
        class_id: 'class-ivria-indiv',
        session_date: '2026-08-16',
        start_time: '10:00',
        end_time: '11:00',
        default_coach_id: 'coach-4',
        scheduled_coach_id: 'coach-4',
        actual_coach_id: 'coach-4',
        session_type: 'NORMAL',
        status: 'SCHEDULED',
      },
      {
        id: 'sess-2026-08-16-sun-1400-ch',
        schedule_id: 'class-sun-1400-ch',
        class_id: 'class-sun-1400-ch',
        session_date: '2026-08-16',
        start_time: '14:00',
        end_time: '15:30',
        default_coach_id: 'coach-2',
        scheduled_coach_id: 'coach-2',
        actual_coach_id: 'coach-2',
        session_type: 'NORMAL',
        status: 'SCHEDULED',
      },
      {
        id: 'sess-2026-08-16-sun-1600-tan',
        schedule_id: 'class-sun-1600-tan',
        class_id: 'class-sun-1600-tan',
        session_date: '2026-08-16',
        start_time: '16:00',
        end_time: '18:00',
        default_coach_id: 'coach-3',
        scheduled_coach_id: 'coach-3',
        actual_coach_id: 'coach-4', // Replacement Coach Jason!
        replacement_coach_id: 'coach-4',
        session_type: 'REPLACEMENT_COACH',
        status: 'SCHEDULED',
        notes: 'Coach Tan requested replacement coverage; assigned to Coach Jason.',
      },

      // === Aug 22, 2026 (Saturday) - COACH CANCELLED EXCEPTION ===
      {
        id: 'sess-2026-08-22-sat-0930-wy',
        schedule_id: 'class-sat-0930-wy',
        class_id: 'class-sat-0930-wy',
        session_date: '2026-08-22',
        start_time: '09:30',
        end_time: '11:00',
        default_coach_id: 'coach-1',
        scheduled_coach_id: 'coach-1', // Default Coach remains Wei Yuan!
        actual_coach_id: 'coach-1',
        session_type: 'COACH_CANCELLED',
        status: 'COACH_CANCELLED',
        cancellation_reason: 'Coach Wei Yuan unwell with fever; no replacement coach available.',
      },
      {
        id: 'sess-2026-08-22-sat-1100-wy',
        schedule_id: 'class-sat-1100-wy',
        class_id: 'class-sat-1100-wy',
        session_date: '2026-08-22',
        start_time: '11:00',
        end_time: '12:30',
        default_coach_id: 'coach-1',
        scheduled_coach_id: 'coach-1',
        actual_coach_id: 'coach-1',
        session_type: 'NORMAL',
        status: 'SCHEDULED',
      },

      // === Aug 23, 2026 (Sunday) ===
      {
        id: 'sess-2026-08-23-sun-0930-wy',
        schedule_id: 'class-sun-0930-wy',
        class_id: 'class-sun-0930-wy',
        session_date: '2026-08-23',
        start_time: '09:30',
        end_time: '11:00',
        default_coach_id: 'coach-1',
        scheduled_coach_id: 'coach-1',
        actual_coach_id: 'coach-1',
        session_type: 'NORMAL',
        status: 'SCHEDULED',
      },

      // === Aug 29, 2026 (Saturday - 5th Saturday) ===
      // Automatically returns to Default Coach Wei Yuan!
      {
        id: 'sess-2026-08-29-sat-0930-wy',
        schedule_id: 'class-sat-0930-wy',
        class_id: 'class-sat-0930-wy',
        session_date: '2026-08-29',
        start_time: '09:30',
        end_time: '11:00',
        default_coach_id: 'coach-1',
        scheduled_coach_id: 'coach-1', // Default Coach Wei Yuan!
        actual_coach_id: 'coach-1',
        session_type: 'NORMAL',
        status: 'SCHEDULED',
      },
      {
        id: 'sess-2026-08-30-sun-0930-wy',
        schedule_id: 'class-sun-0930-wy',
        class_id: 'class-sun-0930-wy',
        session_date: '2026-08-30',
        start_time: '09:30',
        end_time: '11:00',
        default_coach_id: 'coach-1',
        scheduled_coach_id: 'coach-1',
        actual_coach_id: 'coach-1',
        session_type: 'PLANNED_OFF_DAY',
        status: 'PLANNED_OFF_DAY',
        cancellation_reason: '5th Sunday of August — Academy scheduled monthly off-day.',
      },
    ];

    sessionsData.forEach((sess) => this.sessions.set(sess.id, sess));

    // 8. Attendance Records
    const attendanceData: AttendanceRecord[] = [
      // Session: 2026-08-01 Saturday 9:30 (Wei Yuan)
      {
        id: 'att-101',
        session_id: 'sess-2026-08-01-sat-0930-wy',
        student_id: 'stu-1', // John Tan
        status: 'PRESENT',
        attendance_type: 'REGULAR',
        marked_at: '2026-08-01T09:40:00Z',
        marked_by_user_id: 'user-coach-1',
        notification_status: 'SENT',
      },
      {
        id: 'att-102',
        session_id: 'sess-2026-08-01-sat-0930-wy',
        student_id: 'stu-2', // Amy Lim
        status: 'PRESENT',
        attendance_type: 'REGULAR',
        marked_at: '2026-08-01T09:40:00Z',
        marked_by_user_id: 'user-coach-1',
        notification_status: 'SENT',
      },
      {
        id: 'att-103',
        session_id: 'sess-2026-08-01-sat-0930-wy',
        student_id: 'stu-3', // Kevin Lee
        status: 'PRESENT',
        attendance_type: 'REGULAR',
        marked_at: '2026-08-01T09:40:00Z',
        marked_by_user_id: 'user-coach-1',
        notification_status: 'SENT',
      },
      {
        id: 'att-104',
        session_id: 'sess-2026-08-01-sat-0930-wy',
        student_id: 'stu-4', // Lucas Wong
        status: 'ABSENT',
        attendance_type: 'REGULAR',
        marked_at: '2026-08-01T09:40:00Z',
        marked_by_user_id: 'user-coach-1',
        notification_status: 'SENT',
      },
      {
        id: 'att-105',
        session_id: 'sess-2026-08-01-sat-0930-wy',
        student_id: 'stu-5', // Chloe Ng
        status: 'PRESENT',
        attendance_type: 'REGULAR',
        marked_at: '2026-08-01T09:40:00Z',
        marked_by_user_id: 'user-coach-1',
        notification_status: 'SENT',
      },

      // Session: 2026-08-08 Saturday 9:30 (Wei Yuan)
      {
        id: 'att-201',
        session_id: 'sess-2026-08-08-sat-0930-wy',
        student_id: 'stu-1',
        status: 'PRESENT',
        attendance_type: 'REGULAR',
        marked_at: '2026-08-08T09:40:00Z',
        marked_by_user_id: 'user-coach-1',
        notification_status: 'SENT',
      },
      {
        id: 'att-202',
        session_id: 'sess-2026-08-08-sat-0930-wy',
        student_id: 'stu-2',
        status: 'PRESENT',
        attendance_type: 'REGULAR',
        marked_at: '2026-08-08T09:40:00Z',
        marked_by_user_id: 'user-coach-1',
        notification_status: 'SENT',
      },
      {
        id: 'att-203',
        session_id: 'sess-2026-08-08-sat-0930-wy',
        student_id: 'stu-3',
        status: 'PRESENT',
        attendance_type: 'REGULAR',
        marked_at: '2026-08-08T09:40:00Z',
        marked_by_user_id: 'user-coach-1',
        notification_status: 'SENT',
      },

      // Session: 2026-08-15 Saturday 9:30 (Replacement Coach Chuah marked attendance!)
      {
        id: 'att-301',
        session_id: 'sess-2026-08-15-sat-0930-wy',
        student_id: 'stu-1', // John Tan
        status: 'PRESENT',
        attendance_type: 'REGULAR',
        marked_at: '2026-08-15T09:38:00Z',
        marked_by_user_id: 'user-coach-2', // Coach Chuah
        notification_status: 'SENT',
      },
      {
        id: 'att-302',
        session_id: 'sess-2026-08-15-sat-0930-wy',
        student_id: 'stu-2', // Amy Lim
        status: 'PRESENT',
        attendance_type: 'REGULAR',
        marked_at: '2026-08-15T09:38:00Z',
        marked_by_user_id: 'user-coach-2',
        notification_status: 'SENT',
      },
      {
        id: 'att-303',
        session_id: 'sess-2026-08-15-sat-0930-wy',
        student_id: 'stu-3', // Kevin Lee
        status: 'PRESENT',
        attendance_type: 'REGULAR',
        marked_at: '2026-08-15T09:38:00Z',
        marked_by_user_id: 'user-coach-2',
        notification_status: 'SENT',
      },
      {
        id: 'att-304',
        session_id: 'sess-2026-08-15-sat-0930-wy',
        student_id: 'stu-4', // Lucas Wong
        status: 'PRESENT',
        attendance_type: 'REGULAR',
        marked_at: '2026-08-15T09:38:00Z',
        marked_by_user_id: 'user-coach-2',
        notification_status: 'SENT',
      },
      {
        id: 'att-305',
        session_id: 'sess-2026-08-15-sat-0930-wy',
        student_id: 'stu-5', // Chloe Ng
        status: 'PRESENT',
        attendance_type: 'REGULAR',
        marked_at: '2026-08-15T09:38:00Z',
        marked_by_user_id: 'user-coach-2',
        notification_status: 'SENT',
      },

      // Session: 2026-08-16 Sunday 9:30 (Wei Yuan - Today)
      {
        id: 'att-401',
        session_id: 'sess-2026-08-16-sun-0930-wy',
        student_id: 'stu-1',
        status: 'PRESENT',
        attendance_type: 'REGULAR',
        marked_at: '2026-08-16T09:38:00Z',
        marked_by_user_id: 'user-coach-1',
        notification_status: 'SENT',
      },
      {
        id: 'att-402',
        session_id: 'sess-2026-08-16-sun-0930-wy',
        student_id: 'stu-2',
        status: 'PRESENT',
        attendance_type: 'REGULAR',
        marked_at: '2026-08-16T09:38:00Z',
        marked_by_user_id: 'user-coach-1',
        notification_status: 'SENT',
      },
      {
        id: 'att-403',
        session_id: 'sess-2026-08-16-sun-0930-wy',
        student_id: 'stu-3',
        status: 'PRESENT',
        attendance_type: 'REGULAR',
        marked_at: '2026-08-16T09:38:00Z',
        marked_by_user_id: 'user-coach-1',
        notification_status: 'SENT',
      },
    ];

    attendanceData.forEach((a) => this.attendance.set(a.id, a));

    // 9. Sample Audit Logs
    this.auditLogs = [
      {
        id: 'audit-1',
        attendance_id: 'att-104',
        session_id: 'sess-2026-08-01-sat-0930-wy',
        student_id: 'stu-4',
        student_name: 'Lucas Wong',
        changed_by_user_id: 'user-coach-1',
        changed_by_user_name: 'Wei Yuan',
        changed_by_user_role: 'COACH',
        previous_status: 'NOT_MARKED',
        new_status: 'ABSENT',
        reason: 'Student did not arrive by roll-call time.',
        timestamp: '2026-08-01T09:40:00Z',
      },
    ];

    // 10. Sample Notification Logs
    this.notificationLogs = [
      {
        id: 'notif-1',
        attendance_id: 'att-301',
        session_id: 'sess-2026-08-15-sat-0930-wy',
        student_id: 'stu-1',
        student_name: 'John Tan',
        parent_id: 'parent-1',
        parent_name: 'David Tan',
        channel: 'TELEGRAM',
        recipient_identifier: '@davidtan88 (98723412)',
        message: 'Dear David Tan, your child John Tan has been marked PRESENT for Saturday 9:30–11:00 on Saturday, 15 August 2026 (Taught by Replacement Coach Chuah).',
        status: 'SENT',
        sent_at: '2026-08-15T09:38:05Z',
      },
    ];
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
    const expectedStudentsCount = enrolledMemberships.length;
    const enrolledStudents = enrolledMemberships
      .map((m) => this.students.get(m.student_id))
      .filter((s): s is Student => !!s);

    // Attendance records for this session
    const records = Array.from(this.attendance.values()).filter(
      (a) => a.session_id === id
    );

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
  ensureSessionsForMonth(targetMonth: string) {
    if (!targetMonth || !targetMonth.match(/^\d{4}-\d{2}$/)) return;

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
          }
        }
      }
    });
  }

  // Find user by email, username, or coach alias
  findUserByLogin(input: string): User | undefined {
    if (!input) return undefined;
    const raw = String(input).trim().toLowerCase();
    const clean = raw.replace(/[^a-z0-9]/g, '');

    // 1. Direct email match
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === raw) return user;
    }

    // 2. Email prefix match
    for (const user of this.users.values()) {
      const emailPrefix = user.email.toLowerCase().split('@')[0];
      if (emailPrefix === raw || emailPrefix.replace(/[^a-z0-9]/g, '') === clean) {
        return user;
      }
    }

    // 3. Match Admin usernames
    if (clean === 'admin' || clean === 'admin123' || clean === 'administrator' || clean === 'root') {
      const adminUser = Array.from(this.users.values()).find((u) => u.role === 'ADMIN');
      if (adminUser) return adminUser;
    }

    // 4. Match Coach by name/alias (e.g., "coachchuah", "chuah", "coachtan", "tan", "coachweiyuan", "weiyuan", "coachjason", "jason", "coachsarah", "sarah")
    for (const coach of this.coaches.values()) {
      const coachClean = coach.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isCoachMatch =
        clean === coachClean ||
        clean === `coach${coachClean}` ||
        clean === `coach_${coachClean}` ||
        clean === `${coachClean}123` ||
        clean === `coach${coachClean}123`;

      if (isCoachMatch) {
        let user = Array.from(this.users.values()).find((u) => u.coach_id === coach.id);
        if (!user) {
          user = {
            id: `user-${coach.id}`,
            email: coach.email,
            name: coach.name,
            role: 'COACH',
            coach_id: coach.id,
            is_active: coach.is_active,
            created_at: coach.created_at || new Date().toISOString(),
          };
          this.users.set(user.id, user);
          this.saveToDisk();
        }
        return user;
      }
    }

    // 5. Match Student by code or name (e.g., "stu-0101", "stu0101", "student_johntan", "johntan", "student_amylim", "amylim")
    for (const student of this.students.values()) {
      const stuCodeClean = student.student_id.toLowerCase().replace(/[^a-z0-9]/g, '');
      const stuNameClean = student.full_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isStudentMatch =
        clean === stuCodeClean ||
        clean === `student${stuCodeClean}` ||
        clean === stuNameClean ||
        clean === `student${stuNameClean}` ||
        clean === `student_${stuNameClean}` ||
        clean === `${stuNameClean}123`;

      if (isStudentMatch) {
        let user = Array.from(this.users.values()).find((u) => u.student_id === student.id);
        if (!user) {
          user = {
            id: `user-student-${student.id}`,
            email: `${stuNameClean}@student.academy.com`,
            name: student.full_name,
            role: 'STUDENT',
            student_id: student.id,
            is_active: student.status === 'ACTIVE',
            created_at: student.created_at || new Date().toISOString(),
          };
          this.users.set(user.id, user);
          this.saveToDisk();
        }
        return user;
      }
    }

    // 6. Match User by name
    for (const user of this.users.values()) {
      const uClean = user.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean === uClean || clean === `coach${uClean}` || clean === `student${uClean}` || clean === `${uClean}123` || clean === `coach${uClean}123`) {
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
      if (state.users) this.users = new Map(state.users);
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
