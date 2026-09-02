import { AttendanceStatus, AttendanceType } from '../../src/types.js';

export type NotificationChannel = 'WHATSAPP' | 'TELEGRAM' | 'SMS' | 'EMAIL';

export type NotificationStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'DISABLED';

export interface AttendanceNotificationPayload {
  attendanceId: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  parentId?: string;
  parentName?: string;
  parentPhone?: string;
  parentTelegramChatId?: string;
  parentTelegramUsername?: string;
  attendanceStatus: AttendanceStatus;
  attendanceType: AttendanceType;
  className: string;
  sessionDate: string; // YYYY-MM-DD
  startTime: string; // e.g. "09:30"
  endTime?: string; // e.g. "11:00"
  coachName: string;
  replacementNote?: string;
}

export interface NotificationResult {
  success: boolean;
  status: NotificationStatus;
  channel: NotificationChannel;
  recipientIdentifier: string;
  messageText: string;
  externalMessageId?: string;
  errorMessage?: string;
}

export interface NotificationProvider {
  channel: NotificationChannel;
  isEnabled(): boolean;
  send(payload: AttendanceNotificationPayload, formattedMessage: string): Promise<NotificationResult>;
}
