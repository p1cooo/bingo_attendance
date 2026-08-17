import {
  User,
  Coach,
  Student,
  AcademyClass,
  ClassSchedule,
  ClassSession,
  AttendanceRecord,
  AttendanceAuditLog,
  NotificationLog,
  MonthlyReportItem,
  MonthlyStudentReportItem,
} from '../types.js';

const API_BASE = '/api';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('ams_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('ams_token', token);
    } else {
      localStorage.removeItem('ams_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = `HTTP Error ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        // use fallback error message
      }
      throw new Error(errorMessage);
    }

    return response.json() as Promise<T>;
  }

  // --- Auth ---
  async login(usernameOrEmail: string, password: string): Promise<{ token: string; user: User; coach_profile?: Coach }> {
    const res = await this.request<{ token: string; user: User; coach_profile?: Coach }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: usernameOrEmail, email: usernameOrEmail, password }),
    });
    this.setToken(res.token);
    return res;
  }

  async getMe(): Promise<{ user: User; coach_profile?: Coach }> {
    return this.request<{ user: User; coach_profile?: Coach }>('/auth/me');
  }

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch (e) {
      // Ignore errors on logout
    }
    this.setToken(null);
  }

  // --- Coaches ---
  async getCoaches(): Promise<(Coach & { active_schedules_count?: number })[]> {
    return this.request('/coaches');
  }

  async createCoach(data: Partial<Coach>): Promise<Coach> {
    return this.request('/coaches', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCoach(id: string, data: Partial<Coach>): Promise<Coach> {
    return this.request(`/coaches/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCoach(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/coaches/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Students ---
  async getStudents(params?: {
    search?: string;
    coach_id?: string;
    class_id?: string;
    status?: string;
  }): Promise<Student[]> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.coach_id) query.append('coach_id', params.coach_id);
    if (params?.class_id) query.append('class_id', params.class_id);
    if (params?.status) query.append('status', params.status);

    const queryString = query.toString();
    return this.request(`/students${queryString ? `?${queryString}` : ''}`);
  }

  async getStudent(id: string): Promise<Student & { attendance_history?: any[] }> {
    return this.request(`/students/${id}`);
  }

  async createStudent(data: any): Promise<Student> {
    return this.request('/students', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateStudent(id: string, data: any): Promise<Student> {
    return this.request(`/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteStudent(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/students/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Classes ---
  async getClasses(params?: {
    search?: string;
    coach_id?: string;
    class_type?: string;
    day_of_week?: number | string;
    status?: string;
  }): Promise<AcademyClass[]> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.coach_id) query.append('coach_id', params.coach_id);
    if (params?.class_type) query.append('class_type', params.class_type);
    if (params?.day_of_week !== undefined && params?.day_of_week !== '') {
      query.append('day_of_week', String(params.day_of_week));
    }
    if (params?.status) query.append('status', params.status);

    const queryString = query.toString();
    return this.request(`/classes${queryString ? `?${queryString}` : ''}`);
  }

  async createClass(data: Partial<AcademyClass>): Promise<AcademyClass> {
    return this.request('/classes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateClass(id: string, data: Partial<AcademyClass>): Promise<AcademyClass> {
    return this.request(`/classes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async updateClassRoster(id: string, studentIds: string[]): Promise<AcademyClass> {
    return this.request(`/classes/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ student_ids: studentIds }),
    });
  }

  async deleteClass(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/classes/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Schedules ---
  async getSchedules(params?: {
    coach_id?: string;
    class_id?: string;
    day_of_week?: number | string;
    status?: string;
    search?: string;
  }): Promise<ClassSchedule[]> {
    const query = new URLSearchParams();
    if (params?.coach_id) query.append('coach_id', params.coach_id);
    if (params?.class_id) query.append('class_id', params.class_id);
    if (params?.day_of_week !== undefined && params?.day_of_week !== '') {
      query.append('day_of_week', String(params.day_of_week));
    }
    if (params?.status) query.append('status', params.status);
    if (params?.search) query.append('search', params.search);

    const queryString = query.toString();
    return this.request(`/schedules${queryString ? `?${queryString}` : ''}`);
  }

  async createSchedule(data: Partial<ClassSchedule>): Promise<ClassSchedule> {
    return this.request('/schedules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSchedule(id: string, data: Partial<ClassSchedule>): Promise<ClassSchedule> {
    return this.request(`/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSchedule(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/schedules/${id}`, {
      method: 'DELETE',
    });
  }

  async enrollStudent(scheduleId: string, studentId: string): Promise<ClassSchedule> {
    return this.request(`/schedules/${scheduleId}/students`, {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId }),
    });
  }

  async unenrollStudent(scheduleId: string, studentId: string): Promise<ClassSchedule> {
    return this.request(`/schedules/${scheduleId}/students/${studentId}`, {
      method: 'DELETE',
    });
  }

  // --- Sessions ---
  async getSessions(params?: {
    date?: string;
    month?: string;
    coach_id?: string;
    class_id?: string;
    status?: string;
    my_classes_only?: boolean;
  }): Promise<ClassSession[]> {
    const query = new URLSearchParams();
    if (params?.date) query.append('date', params.date);
    if (params?.month) query.append('month', params.month);
    if (params?.coach_id) query.append('coach_id', params.coach_id);
    if (params?.class_id) query.append('class_id', params.class_id);
    if (params?.status) query.append('status', params.status);
    if (params?.my_classes_only) query.append('my_classes_only', 'true');

    const queryString = query.toString();
    return this.request(`/sessions${queryString ? `?${queryString}` : ''}`);
  }

  async getSession(id: string): Promise<ClassSession & { enrolled_students?: Student[] }> {
    return this.request(`/sessions/${id}`);
  }

  async createSession(data: any): Promise<ClassSession> {
    return this.request('/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSession(id: string, data: any): Promise<ClassSession> {
    return this.request(`/sessions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // --- Attendance ---
  async markAttendance(
    sessionId: string,
    data: {
      student_id: string;
      status: string;
      attendance_type?: string;
      replacement_note?: string;
      audit_reason?: string;
    }
  ): Promise<{ success: boolean; attendance_record: AttendanceRecord; session: ClassSession }> {
    return this.request(`/sessions/${sessionId}/attendance`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async addReplacementStudent(
    sessionId: string,
    data: { student_id: string; replacement_note?: string }
  ): Promise<{ success: boolean; attendance_record: AttendanceRecord; session: ClassSession }> {
    return this.request(`/sessions/${sessionId}/replacement-student`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAttendanceRecords(params?: {
    session_id?: string;
    month?: string;
    date?: string;
    coach_id?: string;
    class_id?: string;
    status?: string;
    student_search?: string;
  }): Promise<(AttendanceRecord & { session?: ClassSession })[]> {
    const query = new URLSearchParams();
    if (params?.session_id) query.append('session_id', params.session_id);
    if (params?.month) query.append('month', params.month);
    if (params?.date) query.append('date', params.date);
    if (params?.coach_id) query.append('coach_id', params.coach_id);
    if (params?.class_id) query.append('class_id', params.class_id);
    if (params?.status) query.append('status', params.status);
    if (params?.student_search) query.append('student_search', params.student_search);

    const queryString = query.toString();
    return this.request(`/attendance${queryString ? `?${queryString}` : ''}`);
  }

  async correctAttendance(
    attendanceId: string,
    data: {
      status?: string;
      attendance_type?: string;
      replacement_note?: string;
      reason?: string;
      audit_reason?: string;
    }
  ): Promise<{ success: boolean; attendance_record: AttendanceRecord }> {
    return this.request(`/attendance/${attendanceId}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...data,
        reason: data.reason || data.audit_reason,
      }),
    });
  }

  // --- Reports & Stats ---
  async getDashboardStats(): Promise<{
    month: string;
    sessions_this_month: number;
    student_attendances: number;
    replacement_attendances: number;
    today_sessions: ClassSession[];
    total_active_students: number;
    total_active_coaches: number;
  }> {
    return this.request('/reports/stats');
  }

  async getMonthlyReport(params?: {
    month?: string;
    coach_id?: string;
    class_id?: string;
    student_id?: string;
    class_type?: string;
  }): Promise<{
    month: string;
    coaches_summary: MonthlyReportItem[];
    students_summary: MonthlyStudentReportItem[];
  }> {
    const query = new URLSearchParams();
    if (params?.month) query.append('month', params.month);
    if (params?.coach_id) query.append('coach_id', params.coach_id);
    if (params?.class_id) query.append('class_id', params.class_id);
    if (params?.student_id) query.append('student_id', params.student_id);
    if (params?.class_type) query.append('class_type', params.class_type);

    const queryString = query.toString();
    return this.request(`/reports/monthly${queryString ? `?${queryString}` : ''}`);
  }

  async getAuditLogs(): Promise<AttendanceAuditLog[]> {
    return this.request('/audit-logs');
  }

  async getNotifications(): Promise<NotificationLog[]> {
    return this.request('/notifications');
  }

  async getNotificationLogs(): Promise<NotificationLog[]> {
    return this.getNotifications();
  }

  async getStudentProfile(): Promise<Student> {
    return this.request('/student/me/profile');
  }
}

export const api = new ApiClient();
