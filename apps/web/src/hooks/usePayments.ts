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

export function usePayments(contactId?: string) {
  return useQuery({
    queryKey: ['payments', contactId],
    queryFn: () => paymentsService.getPayments(contactId),
    staleTime: 15_000,
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      contact_id: string;
      service_id: string;
      conversation_id?: string;
      appointment_id?: string;
    }) => paymentsService.createPayment(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments'] }),
  });
}
