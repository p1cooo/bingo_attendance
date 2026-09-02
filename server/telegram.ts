import { db } from './db.js';
import { NotificationLog } from '../src/types.js';
import { syncDocToFirestore } from './firestoreSync.js';

export async function dispatchTelegramNotification(params: {
  attendanceId: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  parentId?: string;
  parentName?: string;
  telegramChatId?: string;
  telegramUsername?: string;
  messageText: string;
}): Promise<NotificationLog> {
  const {
    attendanceId,
    sessionId,
    studentId,
    studentName,
    parentId,
    parentName,
    telegramChatId,
    telegramUsername,
    messageText,
  } = params;

  const notifId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const recipient = telegramChatId || telegramUsername || parentName || 'Parent';

  let status: 'SENT' | 'FAILED' | 'QUEUED' = 'QUEUED';
  let errorMessage: string | undefined;

  if (botToken && telegramChatId) {
    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: messageText,
          parse_mode: 'HTML',
        }),
      });

      const data: any = await response.json();
      if (response.ok && data.ok) {
        status = 'SENT';
      } else {
        status = 'FAILED';
        errorMessage = data.description || `Telegram API responded with code ${response.status}`;
      }
    } catch (err: any) {
      status = 'FAILED';
      errorMessage = err?.message || 'Network error dispatching Telegram notification';
    }
  } else if (!botToken) {
    // Bot token not configured yet; prepare as pending / logged with note
    status = 'QUEUED';
    errorMessage = 'TELEGRAM_BOT_TOKEN environment variable not set';
  } else if (!telegramChatId) {
    status = 'FAILED';
    errorMessage = 'Parent has no Telegram Chat ID configured';
  }

  const notifLog: NotificationLog = {
    id: notifId,
    attendance_id: attendanceId,
    session_id: sessionId,
    student_id: studentId,
    student_name: studentName,
    parent_id: parentId,
    parent_name: parentName,
    channel: 'TELEGRAM',
    recipient_identifier: `${recipient}${telegramChatId ? ` (${telegramChatId})` : ''}`,
    message: messageText,
    status: status as any,
    error_message: errorMessage,
    sent_at: new Date().toISOString(),
  };

  db.notificationLogs.unshift(notifLog);
  if (db.notificationLogs.length > 500) {
    db.notificationLogs.pop();
  }

  // Sync to Firestore
  syncDocToFirestore('notificationLogs', notifId, notifLog).catch(console.error);

  return notifLog;
}
