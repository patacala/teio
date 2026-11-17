'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  paymentsService,
  type UpdatePaymentSettingsBody,
  type CreatePaymentServiceBody,
  type UpdatePaymentServiceBody,
} from '@/services/payments.service';

// ── Settings ──────────────────────────────────────────────────────────────────

export function usePaymentSettings() {
  return useQuery({
    queryKey: ['payment-settings'],
    queryFn: () => paymentsService.getSettings(),
    staleTime: 30_000,
  });
}

export function useUpdatePaymentSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePaymentSettingsBody) => paymentsService.updateSettings(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-settings'] }),
  });
}

// ── Services ──────────────────────────────────────────────────────────────────

export function usePaymentServices() {
  return useQuery({
    queryKey: ['payment-services'],
    queryFn: () => paymentsService.getServices(),
    staleTime: 15_000,
  });
}

export function useCreatePaymentService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePaymentServiceBody) => paymentsService.createService(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-services'] }),
  });
}

export function useUpdatePaymentService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePaymentServiceBody }) =>
      paymentsService.updateService(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-services'] }),
  });
}

export function useDeletePaymentService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => paymentsService.deleteService(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-services'] }),
  });
}

// ── Payments ──────────────────────────────────────────────────────────────────

export function usePayments(contactId?: string, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['payments', contactId],
    queryFn: () => paymentsService.getPayments(contactId),
    staleTime: 15_000,
    enabled: opts.enabled ?? true,
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof paymentsService.createPayment>[0]) => paymentsService.createPayment(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      // A payment link with a booking holds the slot on the agenda.
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

export function usePaymentsNeedingAttention(enabled = true) {
  return useQuery({
    queryKey: ['payments', 'attention'],
    queryFn: () => paymentsService.getPaymentsNeedingAttention(),
    enabled,
    staleTime: 15_000,
  });
}

export function useResolvePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof paymentsService.resolvePayment>[1] }) =>
      paymentsService.resolvePayment(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}
