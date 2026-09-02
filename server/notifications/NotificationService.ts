import { db } from '../db.js';
import { NotificationLog } from '../../src/types.js';
import { syncDocToFirestore } from '../firestoreSync.js';
import {
  AttendanceNotificationPayload,
  NotificationProvider,
} from './types.js';
import { generateAttendanceMessage } from './templates.js';
import { whatsAppProvider } from './whatsappProvider.js';
import { telegramProvider } from './telegramProvider.js';

/**
 * Provider-Independent Notification Service
 * Coordinates templates, phone validation, active providers, and persistence.
 */
export class NotificationService {
  private activeProvider: NotificationProvider;
  private fallbackProvider?: NotificationProvider;

  constructor() {
    // WhatsApp is our primary provider architecture
    this.activeProvider = whatsAppProvider;
    this.fallbackProvider = telegramProvider;
  }

  /**
   * Configure or switch active provider
   */
  public setProvider(provider: NotificationProvider) {
    this.activeProvider = provider;
  }

  /**
   * Main entry point: Dispatches attendance notification to student's parent.
   * Guaranteed to be non-blocking and safe for the core attendance workflow.
   */
  public async sendAttendanceAlert(
    payload: AttendanceNotificationPayload
  ): Promise<NotificationLog> {
    const notifId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const formattedMessage = generateAttendanceMessage(payload);

    let result;
    try {
      result = await this.activeProvider.send(payload, formattedMessage);
    } catch (err: any) {
      result = {
        success: false,
        status: 'FAILED' as const,
        channel: this.activeProvider.channel,
        recipientIdentifier: payload.parentPhone || 'Unknown',
        messageText: formattedMessage,
        errorMessage: err?.message || 'Unexpected failure in notification provider dispatch',
      };
    }

    const notifLog: NotificationLog = {
      id: notifId,
      attendance_id: payload.attendanceId,
      session_id: payload.sessionId,
      student_id: payload.studentId,
      student_name: payload.studentName,
      parent_id: payload.parentId,
      parent_name: payload.parentName,
      channel: result.channel,
      recipient_identifier: result.recipientIdentifier,
      recipient_name: payload.parentName,
      recipient_phone: result.channel === 'WHATSAPP' ? result.recipientIdentifier : undefined,
      recipient_telegram: result.channel === 'TELEGRAM' ? result.recipientIdentifier : undefined,
      message: result.messageText,
      status: result.status,
      error_message: result.errorMessage,
      external_message_id: result.externalMessageId,
      created_at: new Date().toISOString(),
      sent_at: result.status === 'SENT' ? new Date().toISOString() : undefined,
    };

    try {
      db.notificationLogs.unshift(notifLog);
      if (db.notificationLogs.length > 500) {
        db.notificationLogs.pop();
      }

      // Sync to Firestore
      syncDocToFirestore('notificationLogs', notifId, notifLog).catch((err) => {
        console.error('[NotificationService] Firestore sync error:', err?.message);
      });
    } catch (dbErr: any) {
      console.error('[NotificationService] In-memory log error:', dbErr?.message);
    }

    return notifLog;
  }
}

export const notificationService = new NotificationService();
