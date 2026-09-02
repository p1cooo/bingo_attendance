import { AttendanceNotificationPayload, NotificationProvider, NotificationResult } from './types.js';

/**
 * Legacy Telegram Notification Provider (Isolated for backwards compatibility)
 */
export class TelegramProvider implements NotificationProvider {
  public readonly channel = 'TELEGRAM' as const;

  public isEnabled(): boolean {
    return !!process.env.TELEGRAM_BOT_TOKEN?.trim();
  }

  public async send(
    payload: AttendanceNotificationPayload,
    formattedMessage: string
  ): Promise<NotificationResult> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = payload.parentTelegramChatId;
    const recipient = chatId || payload.parentTelegramUsername || payload.parentName || 'Parent';

    if (!botToken) {
      return {
        success: false,
        status: 'QUEUED',
        channel: this.channel,
        recipientIdentifier: recipient,
        messageText: formattedMessage,
        errorMessage: 'TELEGRAM_BOT_TOKEN environment variable not set',
      };
    }

    if (!chatId) {
      return {
        success: false,
        status: 'FAILED',
        channel: this.channel,
        recipientIdentifier: recipient,
        messageText: formattedMessage,
        errorMessage: 'Parent has no Telegram Chat ID configured',
      };
    }

    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: formattedMessage,
          parse_mode: 'HTML',
        }),
      });

      const data: any = await response.json();
      if (response.ok && data.ok) {
        return {
          success: true,
          status: 'SENT',
          channel: this.channel,
          recipientIdentifier: `${recipient} (${chatId})`,
          messageText: formattedMessage,
          externalMessageId: data.result?.message_id?.toString(),
        };
      } else {
        return {
          success: false,
          status: 'FAILED',
          channel: this.channel,
          recipientIdentifier: `${recipient} (${chatId})`,
          messageText: formattedMessage,
          errorMessage: data.description || `Telegram API error HTTP ${response.status}`,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        status: 'FAILED',
        channel: this.channel,
        recipientIdentifier: `${recipient} (${chatId})`,
        messageText: formattedMessage,
        errorMessage: err?.message || 'Network error dispatching Telegram message',
      };
    }
  }
}

export const telegramProvider = new TelegramProvider();
