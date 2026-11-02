/**
 * WAHA (WhatsApp HTTP API) — self-hosted WhatsApp provider.
 *
 * A WAHA "session" is one linked phone number and maps 1:1 to a channel row
 * with `type = 'whatsapp'` and `provider = 'waha'`.
 */

export type WhatsAppSessionStatus =
  | 'STOPPED'
  | 'STARTING'
  | 'SCAN_QR_CODE'
  | 'PASSKEY_REQUIRED'
  | 'PASSKEY_CONFIRMATION_REQUIRED'
  | 'WORKING'
  | 'FAILED';

/** Link state of a WhatsApp channel, as returned by the status/QR endpoints. */
export interface WhatsAppSessionState {
  channel_id: string;
  session_name: string;
  status: WhatsAppSessionStatus;
  /** Linked number in bare digits (no `@c.us`). Null until the QR is scanned. */
  phone_number: string | null;
  /** WhatsApp profile name of the linked account. */
  push_name: string | null;
  /** True once the session reaches WORKING — mirrors `channel.is_active`. */
  connected: boolean;
}

export interface WhatsAppQrResponse extends WhatsAppSessionState {
  /** PNG data URI, present only while status is SCAN_QR_CODE. */
  qr: string | null;
}

export interface WhatsAppPairingCodeResponse {
  code: string;
}
