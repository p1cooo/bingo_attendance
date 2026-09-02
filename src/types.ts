export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'COACH';

export type ClassType = 'GROUP' | 'INDIVIDUAL';

export type ScheduleStatus = 'ACTIVE' | 'INACTIVE';

export type SessionStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'OFF_DAY' | 'COACH_CANCELLED' | 'PLANNED_OFF_DAY';

export type SessionType = 'NORMAL' | 'REPLACEMENT_COACH' | 'COACH_CANCELLED' | 'PLANNED_OFF_DAY';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'LATE';

export type AttendanceType = 'REGULAR' | 'REPLACEMENT';

export type NotificationStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'DISABLED';

export interface User {
  id: string;
  username?: string;
  email: string;
  name: string;
  role: UserRole;
  coach_id?: string;
  student_id?: string;
  is_active: boolean;
  created_at: string;
  last_login_at?: string;
}

export interface Coach {
  id: string;
  name: string;
  email: string;
  phone: string;
  color: string; // Hex color (e.g. #3b82f6)
  color_name: string; // e.g. "Pastel Blue"
  is_active: boolean;
  bio?: string;
  created_at: string;
}

export interface Parent {
  id: string;
  name: string;
  phone: string;
  email?: string;
  telegram_chat_id?: string;
  telegram_username?: string;
  created_at: string;
}

export interface Student {
  id: string;
  student_id: string; // e.g. STU-0101 or UNREG-XXXX
  full_name: string;
  nick_name?: string;
  school?: string;
  parent_id?: string;
  parent_relation?: string;
  status: 'ACTIVE' | 'INACTIVE';
  is_unregistered?: boolean; // True if student was entered on-the-fly without a registered profile
  parent?: Parent;
  enrolled_schedules?: ClassScheduleSummary[];
  attendance_summary?: {
    total_sessions: number;
    present_count: number;
    replacement_count: number;
    rate_percent: number;
  };
  created_at: string;
}

export interface AcademyClass {
  id: string;
  name: string; // e.g. "Saturday 9:30–11:00", "Saturday 11:00–12:30", "Joshua – Individual"
  class_type: ClassType;
  day_of_week?: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  start_time?: string; // e.g. "09:30"
  end_time?: string; // e.g. "11:00"
  default_coach_id?: string; // Permanent Default Coach assigned to the class once
  default_coach?: Coach;
  room_location?: string;
  description?: string;
  default_duration_mins: number;
  default_capacity: number;
  is_active: boolean;
  student_ids?: string[];
  enrolled_students_count?: number;
  enrolled_student_ids?: string[];
  enrolled_students?: Student[];
  created_at: string;
}

export interface ClassSchedule {
  id: string;
  class_id: string;
  coach_id: string; // Scheduled default coach
  default_coach_id?: string;
  day_of_week: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  start_time: string; // e.g. "09:30"
  end_time: string; // e.g. "11:00"
  room_location?: string;
  status: ScheduleStatus;
  is_active: boolean;
  class_item?: AcademyClass;
  coach?: Coach;
  default_coach?: Coach;
  enrolled_students_count?: number;
  enrolled_student_ids?: string[];
  enrolled_students?: Student[];
  created_at: string;
}

export interface ClassScheduleSummary {
  schedule_id: string;
  class_name: string;
  class_type: ClassType;
  coach_name: string;
  coach_color: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface StudentClassMembership {
  id: string;
  student_id: string;
  schedule_id: string;
  joined_date: string;
  ended_date?: string;
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
}

export interface ClassSession {
  id: string;
  schedule_id: string;
  class_id: string;
  session_date: string; // YYYY-MM-DD
  start_time: string;
  end_time: string;
  default_coach_id?: string; // The permanent Default Coach from Class
  replacement_coach_id?: string | null; // One-session exception replacement coach
  scheduled_coach_id: string; // For compatibility (= default_coach_id)
  actual_coach_id: string; // For compatibility (= replacement_coach_id || default_coach_id)
  session_type?: SessionType;
  status: SessionStatus;
  cancellation_reason?: string;
  notes?: string;
  class_item?: AcademyClass;
  default_coach?: Coach;
  replacement_coach?: Coach | null;
  teaching_coach?: Coach;
  scheduled_coach?: Coach;
  actual_coach?: Coach;
  expected_students_count?: number;
  marked_attendance_count?: number;
  present_count?: number;
  attendance_records?: AttendanceRecord[];
  enrolled_students?: Student[];
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  status: AttendanceStatus;
  attendance_type: AttendanceType;
  replacement_note?: string;
  marked_at: string;
  marked_by_user_id: string;
  marked_by_user_name?: string;
  student?: Student;
  notification_status?: NotificationStatus;
}

export interface AttendanceAuditLog {
  id: string;
  attendance_id: string;
  session_id: string;
  student_id: string;
  student_name?: string;
  changed_by_user_id: string;
  changed_by_user_name: string;
  changed_by_user_role: UserRole;
  previous_status: AttendanceStatus | 'NOT_MARKED';
  new_status: AttendanceStatus;
  reason: string;
  timestamp: string;
}

export interface NotificationLog {
  id: string;
  attendance_id: string;
  session_id: string;
  student_id: string;
  student_name?: string;
  parent_id?: string;
  parent_name?: string;
  channel: 'TELEGRAM' | 'WHATSAPP' | 'SMS' | 'EMAIL';
  recipient_identifier: string;
  recipient_name?: string;
  recipient_phone?: string;
  recipient_telegram?: string;
  message: string;
  status: NotificationStatus;
  error_message?: string;
  external_message_id?: string;
  created_at?: string;
  sent_at?: string;
}

export interface MonthlyReportItem {
  coach_id: string;
  coach_name: string;
  coach_color: string;
  total_sessions_taught: number;
  normal_sessions_taught: number;
  replacement_sessions_taught: number;
  cancelled_sessions_count: number;
  planned_off_days_count: number;
  group_sessions_count: number;
  individual_sessions_count: number;
  total_student_attendances: number;
  total_replacement_students: number;
  sessions: {
    session_id: string;
    date: string;
    class_name: string;
    class_type: ClassType;
    is_replacement_coach: boolean;
    present_students: number;
    replacement_students: number;
  }[];
}

export interface MonthlyStudentReportItem {
  student_id: string;
  student_code: string;
  student_name: string;
  school?: string;
  parent_name?: string;
  parent_phone?: string;
  enrolled_classes: string[];
  total_scheduled: number;
  attended_count: number;
  absent_count: number;
  replacement_count: number;
  attendance_rate: number;
  attendances: {
    date: string;
    class_name: string;
    coach_name: string;
    status: AttendanceStatus;
    type: AttendanceType;
  }[];
}

export interface AuthSession {
  token: string;
  user: User;
  coach_profile?: Coach;
}
