import { authClient } from '@/lib/auth-client';
import type {
  WhatsAppSessionState,
  WhatsAppQrResponse,
  WhatsAppPairingCodeResponse,
} from '@crm/shared';

export type {
  WhatsAppSessionState,
  WhatsAppQrResponse,
  WhatsAppSessionStatus,
} from '@crm/shared';

export interface Channel {
  id: string;
  organization_id: string;
  type: string;
  provider: string;
  external_identifier: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateChannelBody {
  type: string;
  provider: string;
  external_identifier: string;
  config?: Record<string, unknown>;
}

export interface UpdateChannelBody {
  config?: Record<string, unknown>;
  is_active?: boolean;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
}

export const channelsService = {
  getChannels: () =>
    authClient.get<Channel[]>('/channels'),

  getChannel: (id: string) =>
    authClient.get<Channel>(`/channels/${id}`),

  createChannel: (body: CreateChannelBody) =>
    authClient.post<Channel>('/channels', body),

  updateChannel: (id: string, body: UpdateChannelBody) =>
    authClient.patch<Channel>(`/channels/${id}`, body),

  deleteChannel: (id: string) =>
    authClient.delete<void>(`/channels/${id}`),

  deactivateChannel: (id: string) =>
    authClient.patch<Channel>(`/channels/${id}/deactivate`, {}),

  testChannelConnection: (id: string) =>
    authClient.post<TestConnectionResult>(`/channels/${id}/test`, {}),
};

/**
 * WhatsApp linking via WAHA. The channel is created by `createSession`; the
 * number is only known once the user scans the QR, so the UI polls `getStatus`
 * (or `getQr`, which returns the state alongside the image) until `connected`.
 */
export const whatsappService = {
  createSession: (body: { label?: string } = {}) =>
    authClient.post<WhatsAppSessionState>('/channels/whatsapp/sessions', body),

  getStatus: (id: string) =>
    authClient.get<WhatsAppSessionState>(`/channels/whatsapp/${id}/status`),

  getQr: (id: string) =>
    authClient.get<WhatsAppQrResponse>(`/channels/whatsapp/${id}/qr`),

  requestPairingCode: (id: string, phoneNumber: string) =>
    authClient.post<WhatsAppPairingCodeResponse>(
      `/channels/whatsapp/${id}/pairing-code`,
      { phone_number: phoneNumber },
    ),

  relink: (id: string) =>
    authClient.post<WhatsAppSessionState>(`/channels/whatsapp/${id}/relink`, {}),

  unlink: (id: string) =>
    authClient.post<WhatsAppSessionState>(`/channels/whatsapp/${id}/unlink`, {}),
};
