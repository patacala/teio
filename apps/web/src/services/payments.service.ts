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

export interface UpdatePaymentServiceBody extends Partial<CreatePaymentServiceBody> {}

export interface PaymentContact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface Payment {
  id: string;
  organization_id: string;
  service_id: string | null;
  service?: PaymentService | null;
  contact_id: string;
  contact?: PaymentContact | null;
  conversation_id: string | null;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'expired' | 'canceled' | 'failed';
  checkout_url: string | null;
  paid_at: string | null;
  created_at: string;
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
      booking: {
        calendar_id: string;
        title: string;
        starts_at: string;
        duration_minutes: number;
        timezone?: string;
      } | null;
    }>('/payments', body),
};
