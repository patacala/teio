'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { usePaymentsNeedingAttention, useResolvePayment } from '@/hooks/usePayments';
import { schedulingService } from '@/services/scheduling.service';
import { toast } from '@/hooks/useToast';
import type { Payment, PaymentResolution } from '@/services/payments.service';

const REASONS: Record<string, string> = {
  slot_unavailable: 'Paid, but the time was taken before the payment arrived',
  appointment_cancelled: 'The paid appointment was cancelled',
  booking_failed: 'Paid, but the appointment could not be created',
};

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'usd').toUpperCase() }).format(cents / 100);
}

function who(p: Payment): string {
  if (p.contact) return [p.contact.first_name, p.contact.last_name].filter(Boolean).join(' ');
  return p.contact_name ?? 'Deleted contact';
}

/** The contact's upcoming, unpaid bookings the payment can be moved to. */
function useRebookOptions(contactId: string | null) {
  return useQuery({
    queryKey: ['appointments', 'rebook-options', contactId],
    queryFn: async () => {
      const page = await schedulingService.getAppointments({
        contact_id: contactId!,
        from: new Date().toISOString(),
        sort: 'asc',
        limit: 50,
      });
      return page.items.filter((a) => ['scheduled', 'confirmed'].includes(a.status) && !a.payment_id);
    },
    enabled: !!contactId,
  });
}

function AttentionRow({ payment }: { payment: Payment }) {
  const resolve = useResolvePayment();
  const [note, setNote] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const { data: options = [] } = useRebookOptions(payment.contact_id);

  const submit = async (resolution: PaymentResolution) => {
    try {
      await resolve.mutateAsync({
        id: payment.id,
        body: {
          resolution,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(resolution === 'rebooked' ? { appointment_id: appointmentId } : {}),
        },
      });
      toast({ title: 'Payment resolved' });
    } catch (err) {
      toast({ title: (err as Error)?.message || 'Could not resolve the payment', variant: 'error' });
    }
  };

  return (
    <li className="rounded-xl border border-danger/30 bg-surface p-4 space-y-3" data-testid={`attention-${payment.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-primary">
            {who(payment)} · {money(payment.amount, payment.currency)}
          </p>
          <p className="text-xs text-danger">{REASONS[payment.attention_reason ?? ''] ?? payment.attention_reason}</p>
          <p className="text-xs text-muted">{payment.service?.name ?? 'Service'} · paid {payment.paid_at ? new Date(payment.paid_at).toLocaleString() : ''}</p>
        </div>
      </div>

      <Input placeholder="Note (optional): what was agreed with the contact" value={note} onChange={(e) => setNote(e.target.value)} />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={appointmentId} onValueChange={setAppointmentId}>
          <SelectTrigger className="w-64 bg-surface text-primary" aria-label="Appointment for this payment">
            <SelectValue placeholder={options.length ? 'Choose the new appointment' : 'Book one in the agenda first'} />
          </SelectTrigger>
          <SelectContent>
            {options.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.title} · {new Date(a.starts_at).toLocaleString()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!appointmentId || resolve.isPending} onClick={() => submit('rebooked')}>
          Rebooked
        </Button>
        <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => submit('refunded_manually')}>
          Refunded in Stripe
        </Button>
        <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => submit('dismissed')}>
          Dismiss
        </Button>
      </div>
    </li>
  );
}

/** Paid payments a person has to follow up. Nothing is refunded automatically. */
export function AttentionTab() {
  const { data: payments = [], isLoading } = usePaymentsNeedingAttention();

  if (isLoading) return <p className="text-sm text-secondary">Loading…</p>;
  if (!payments.length) {
    return <p className="text-sm text-secondary">Nothing to review. Paid bookings that need a person will show up here.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-secondary">
        Refunds are never automatic: refund in your Stripe dashboard if needed, then mark it here.
      </p>
      <ul className="space-y-3">
        {payments.map((p) => (
          <AttentionRow key={p.id} payment={p} />
        ))}
      </ul>
    </div>
  );
}
