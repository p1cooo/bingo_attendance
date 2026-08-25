import { AttendanceNotificationPayload, NotificationProvider, NotificationResult } from './types.js';
import { sanitizeAndValidatePhone } from './phoneUtils.js';

export class WhatsAppProvider implements NotificationProvider {
  public readonly channel = 'WHATSAPP' as const;

  /**
   * Check if live WhatsApp Cloud API dispatch is enabled.
   * Defaults to false in Phase 1 (Test Mode Architecture).
   */
  public isEnabled(): boolean {
    return process.env.WHATSAPP_ENABLED === 'true';
  }

  /**
   * Dispatch an attendance notification via WhatsApp Cloud API or simulate in Test Mode.
   */
  public async send(
    payload: AttendanceNotificationPayload,
    formattedMessage: string
  ): Promise<NotificationResult> {
    const rawPhone = payload.parentPhone;
    const validation = sanitizeAndValidatePhone(rawPhone);

    // 1. Validate recipient phone number first
    if (!validation.isValid) {
      return {
        success: false,
        status: 'FAILED',
        channel: this.channel,
        recipientIdentifier: rawPhone || 'Missing Phone',
        messageText: formattedMessage,
        errorMessage: validation.error || 'Missing or invalid WhatsApp phone number',
      };
    }

    const recipientPhone = validation.formattedNumber;

    // 2. Check if live Meta WhatsApp Cloud API is enabled
    const isLiveEnabled = this.isEnabled();
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

    if (!isLiveEnabled) {
      // PHASE 1: Strictly Test Mode
      // Do NOT send any HTTP request to Meta
      // Do NOT mark as SENT
      return {
        success: false,
        status: 'DISABLED',
        channel: this.channel,
        recipientIdentifier: recipientPhone,
        messageText: formattedMessage,
        errorMessage: 'WhatsApp Cloud API is in TEST MODE (WHATSAPP_ENABLED=false). No live message was dispatched.',
      };
    }

    // 3. Live Mode (Phase 2): Validate required credentials
    if (!accessToken || !phoneNumberId) {
      return {
        success: false,
        status: 'QUEUED',
        channel: this.channel,
        recipientIdentifier: recipientPhone,
        messageText: formattedMessage,
        errorMessage: 'WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID environment variable not set',
      };
    }

    // 4. Live Mode Dispatch to Meta Graph API
    try {
      const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
      // Clean leading '+' for WhatsApp recipient payload (e.g. "60123456789")
      const waRecipient = recipientPhone.replace(/^\+/, '');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: waRecipient,
          type: 'text',
          text: {
            preview_url: false,
            body: formattedMessage,
          },
        }),
      });

      const responseData: any = await response.json();

      if (response.ok && responseData.messages?.[0]?.id) {
        return {
          success: true,
          status: 'SENT',
          channel: this.channel,
          recipientIdentifier: recipientPhone,
          messageText: formattedMessage,
          externalMessageId: responseData.messages[0].id,
        };
      } else {
        const metaError =
          responseData?.error?.message ||
          `Meta WhatsApp API responded with HTTP status ${response.status}`;
        return {
          success: false,
          status: 'FAILED',
          channel: this.channel,
          recipientIdentifier: recipientPhone,
          messageText: formattedMessage,
          errorMessage: metaError,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        status: 'FAILED',
        channel: this.channel,
        recipientIdentifier: recipientPhone,
        messageText: formattedMessage,
        errorMessage: err?.message || 'Network error connecting to Meta WhatsApp Cloud API',
      };
    }
  }
}

export const whatsAppProvider = new WhatsAppProvider();
