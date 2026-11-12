import { authClient } from '@/lib/auth-client';

export interface PaymentSettings {
  currency: string;
  is_connected: boolean;
  stripe_secret_key: string | null;
  stripe_webhook_secret: string | null;
  webhook_url: string;
  updated_at: string;
}

export interface UpdatePaymentSettingsBody {
  stripe_secret_key?: string;
  stripe_webhook_secret?: string;
  currency?: string;
}

export interface PaymentService {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  amount: number; // cents
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePaymentServiceBody {
  name: string;
  description?: string;
  amount: number;
  is_active?: boolean;
}

export type UpdatePaymentServiceBody = Partial<CreatePaymentServiceBody>;

export interface PaymentContact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

export type PaymentAttentionReason = 'slot_unavailable' | 'appointment_cancelled' | 'booking_failed';
export type PaymentResolution = 'rebooked' | 'refunded_manually' | 'dismissed';

export interface Payment {
  id: string;
  organization_id: string;
  service_id: string | null;
  service?: PaymentService | null;
  /** Null once the contact was deleted; the name/email copy stays. */
  contact_id: string | null;
  contact?: PaymentContact | null;
  contact_name?: string | null;
  contact_email?: string | null;
  conversation_id: string | null;
  appointment_id?: string | null;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'expired' | 'canceled' | 'failed' | 'refunded';
  checkout_url: string | null;
  paid_at: string | null;
  /** Paid, but a person has to follow up (no automatic refunds). */
  attention_reason?: PaymentAttentionReason | null;
  attention_at?: string | null;
  resolution?: PaymentResolution | null;
  resolution_note?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

export interface ResolvePaymentBody {
  resolution: PaymentResolution;
  note?: string;
  /** Required for 'rebooked': the appointment the payment now covers. */
  appointment_id?: string;
}

export const paymentsService = {
  // Settings
  getSettings: () => authClient.get<PaymentSettings>('/payments/settings'),
  updateSettings: (body: UpdatePaymentSettingsBody) =>
    authClient.patch<PaymentSettings>('/payments/settings', body),

  // Services
  getServices: () => authClient.get<PaymentService[]>('/payments/services'),
  createService: (body: CreatePaymentServiceBody) =>
    authClient.post<PaymentService>('/payments/services', body),
  updateService: (id: string, body: UpdatePaymentServiceBody) =>
    authClient.patch<PaymentService>(`/payments/services/${id}`, body),
  deleteService: (id: string) => authClient.delete<void>(`/payments/services/${id}`),

  // Payments
  getPaymentsNeedingAttention: () => authClient.get<Payment[]>('/payments/attention'),
  resolvePayment: (id: string, body: ResolvePaymentBody) => authClient.post<Payment>(`/payments/${id}/resolve`, body),
  getPayments: (contactId?: string) =>
    authClient.get<Payment[]>(`/payments${contactId ? `?contact_id=${contactId}` : ''}`),
  createPayment: (body: {
    contact_id: string;
    service_id: string;
    conversation_id?: string;
    appointment_id?: string;
    booking?: {
      calendar_id?: string;
      title?: string;
      starts_at: string;
      duration_minutes: number;
      timezone?: string;
    };
  }) =>
    authClient.post<{
      payment_id: string;
      url: string;
      amount: number;
      currency: string;
      service_name: string;
      appointment_id: string | null;
      hold_expires_at: string | null;
      booking: {
        calendar_id: string;
        title: string;
        starts_at: string;
        duration_minutes: number;
        timezone?: string;
      } | null;
    }>('/payments', body),
};
