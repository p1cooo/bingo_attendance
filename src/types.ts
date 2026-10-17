export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'COACH';

export interface StudentFee {
  id: string; student_id: string; membership_id: string; class_id: string;
  class_name: string; coach_name: string; billing_mode: 'MONTHLY' | 'PER_SESSION';
  amount_cents: number; effective_month: string; created_by_user_id: string; created_at: string;
  created_by_name?: string;
}
export interface PaymentAllocation { month: string; amount_cents: number; }
export interface StudentPayment {
  id: string; student_id: string; amount_cents: number; payment_date: string;
  method: string; source: 'MANUAL' | 'ONLINE_PARENT_PORTAL' | 'OTHER';
  reference?: string; notes?: string; allocations: PaymentAllocation[];
  recorded_by_user_id: string; created_at: string;
  recorded_by_name?: string;
}
export interface StudentAdjustment {
  id: string; student_id: string; month: string; amount_cents: number;
  type: 'DISCOUNT' | 'CREDIT' | 'WAIVER' | 'CORRECTION';
  reason: string; created_by_user_id: string; created_at: string;
  created_by_name?: string;
}

export type ClassType = 'GROUP' | 'INDIVIDUAL';

export type ScheduleStatus = 'ACTIVE' | 'INACTIVE';

export type SessionStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'OFF_DAY' | 'COACH_CANCELLED' | 'PLANNED_OFF_DAY';

export type SessionType = 'NORMAL' | 'REPLACEMENT_COACH' | 'COACH_CANCELLED' | 'PLANNED_OFF_DAY';

export type AttendanceStatus = 'BOOKED' | 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'LATE';

export type AttendanceType = 'REGULAR' | 'REPLACEMENT';
export type ReplacementCreditReason = 'GROUP_ABSENCE_CREDIT' | 'REPLACEMENT_ATTENDED_DEBIT' | 'REPLACEMENT_BOOKING_DEBIT' | 'OPENING_BALANCE_ADJUSTMENT' | 'ADMIN_ADJUSTMENT' | 'REVERSAL' | 'ADVANCE_REPLACEMENT_DEBIT';
export interface ReplacementCredit { id:string; student_id:string; amount:number; reason:ReplacementCreditReason; attendance_id?:string; session_id?:string; advance_commitment_id?:string; created_by_user_id?:string; created_at:string; effective_at:string; idempotency_key:string; }
export type ReplacementAdvanceCommitmentStatus = 'PENDING' | 'RECONCILED' | 'REVIEW_REQUIRED';
export interface ReplacementAdvanceCommitment {
  id: string;
  student_id: string;
  replacement_attendance_id: string;
  replacement_session_id: string;
  future_session_id: string;
  status: ReplacementAdvanceCommitmentStatus;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

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
  portal_coach_sync_names?: string[];
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

export type PauseReason = 'EXAMINATION' | 'HOLIDAY_TRAVEL' | 'MEDICAL_HEALTH' | 'PERSONAL' | 'OTHER';
export interface StudentPause {
  id: string;
  student_id: string;
  membership_id: string;
  schedule_id: string;
  class_id: string;
  start_date: string;
  end_date: string | null;
  reason: PauseReason;
  note?: string;
  declared_by_user_id: string;
  declared_by_name: string;
  declared_by_role: UserRole;
  created_at: string;
  updated_at: string;
  resumed_at?: string;
  resumed_by_user_id?: string;
  attendance_conflict_ids?: string[];
  billing_reviews?: Record<string, { amount_cents: number; reviewed_by_user_id: string; reviewed_at: string }>;
  history: Array<{ action: 'DECLARED' | 'RESUMED' | 'BILLING_REVIEWED'; at: string; user_id: string; details?: string }>;
}

export interface ClassSession {
  id: string;
  occurrence_revision?: string;
  schedule_id: string;
  class_id: string;
  session_date: string; // YYYY-MM-DD
  /** The recurring timetable slot for a moved occurrence. */
  original_session_date?: string | null;
  original_start_time?: string | null;
  original_end_time?: string | null;
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
  /** False for a scheduled occurrence before electronic attendance go-live. */
  attendance_expected?: boolean;
  marked_attendance_count?: number;
  present_count?: number;
  attendance_records?: AttendanceRecord[];
  enrolled_students?: Student[];
  paused_students?: Array<{ id: string; student_id: string; membership_id: string; start_date: string; end_date: string | null }>;
  enrolled_memberships?: Array<{ student_id: string; membership_id: string }>;
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
  base_stars?: number;
  lucky_tshirt_worn?: boolean;
  portal_sync_status?: 'SYNCED' | 'NOT_LINKED' | 'PENDING' | 'DISABLED';
  portal_transaction_id?: string;
  portal_awarded_stars?: number;
  portal_multiplier?: number;
  portal_sync_message?: string;
  /** Replacement-credit effect already reconciled for this attendance row. */
  replacement_credit_impact?: number;
  /** Monotonic transition number used in durable ledger idempotency keys. */
  replacement_credit_revision?: number;
  replacement_advance_commitment_id?: string;
  trial_request_key?: string;
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

export interface ActivityLog {
  id: string;
  actor_user_id: string;
  actor_user_name: string;
  actor_role: UserRole;
  action: string;
  entity_type: string;
  entity_id: string;
  class_id?: string;
  summary?: string;
  previous_values?: unknown;
  new_values?: unknown;
  notes?: string;
  created_at: string;
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
