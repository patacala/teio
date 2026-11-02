'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  channelsService,
  whatsappService,
  type CreateChannelBody,
  type UpdateChannelBody,
} from '@/services/channels.service';

export function useChannels() {
  return useQuery({
    queryKey: ['channels'],
    queryFn: () => channelsService.getChannels(),
    staleTime: 30_000,
  });
}

export function useChannel(id: string | null) {
  return useQuery({
    queryKey: ['channels', id],
    queryFn: () => channelsService.getChannel(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateChannelBody) => channelsService.createChannel(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });
}

export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateChannelBody }) =>
      channelsService.updateChannel(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => channelsService.deleteChannel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });
}

export function useDeactivateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => channelsService.deactivateChannel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });
}

export function useTestChannelConnection() {
  return useMutation({
    mutationFn: (id: string) => channelsService.testChannelConnection(id),
  });
}

/* -------------------------------------------------------------------------- */
/* WhatsApp (WAHA) linking                                                     */
/* -------------------------------------------------------------------------- */

const QR_POLL_INTERVAL = 3_000;

export function useCreateWhatsAppSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { label?: string } = {}) => whatsappService.createSession(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });
}

/**
 * Polls the QR + link state while the session is waiting to be scanned, and
 * stops on its own once connected (or when the dialog unmounts).
 */
export function useWhatsAppQr(channelId: string | null) {
  return useQuery({
    queryKey: ['channels', 'whatsapp', channelId, 'qr'],
    queryFn: () => whatsappService.getQr(channelId!),
    enabled: !!channelId,
    refetchInterval: (query) =>
      query.state.data?.connected ? false : QR_POLL_INTERVAL,
    gcTime: 0,
  });
}

export function useWhatsAppStatus(channelId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['channels', 'whatsapp', channelId, 'status'],
    queryFn: () => whatsappService.getStatus(channelId!),
    enabled: !!channelId && enabled,
    staleTime: 10_000,
  });
}

export function useWhatsAppPairingCode() {
  return useMutation({
    mutationFn: ({ id, phoneNumber }: { id: string; phoneNumber: string }) =>
      whatsappService.requestPairingCode(id, phoneNumber),
  });
}

export function useRelinkWhatsApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => whatsappService.relink(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });
}

export function useUnlinkWhatsApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => whatsappService.unlink(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });
}
