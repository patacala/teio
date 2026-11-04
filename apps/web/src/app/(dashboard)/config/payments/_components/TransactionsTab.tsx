'use client';

import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { usePayments } from '@/hooks/usePayments';
import type { Payment, PaymentContact } from '@/services/payments.service';

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (currency || 'usd').toUpperCase(),
  }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function contactName(contact?: PaymentContact | null): string {
  if (!contact) return 'Unknown contact';
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unnamed';
}

const STATUS_META: Record<
  Payment['status'],
  { label: string; variant: 'success' | 'warn' | 'default' | 'destructive' }
> = {
  paid: { label: 'Paid', variant: 'success' },
  pending: { label: 'Pending', variant: 'warn' },
  expired: { label: 'Expired', variant: 'default' },
  canceled: { label: 'Cancelled', variant: 'default' },
  failed: { label: 'Failed', variant: 'destructive' },
};

const FILTERS: { value: 'all' | Payment['status']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
];

export function TransactionsTab() {
  const { data: payments, isLoading } = usePayments();
  const [filter, setFilter] = useState<'all' | Payment['status']>('all');

  const filtered = useMemo(
    () => (payments ?? []).filter((p) => (filter === 'all' ? true : p.status === filter)),
    [payments, filter],
  );

  if (isLoading) {
    return (
      <div className="space-y-2 max-w-4xl">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl border border-subtle animate-pulse bg-surface" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-4xl">
      <div className="flex items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={
              filter === f.value
                ? 'px-3 py-1 rounded-full border border-accent/20 text-xs font-medium bg-olive-dark text-accent'
                : 'px-3 py-1 rounded-full border border-subtle text-xs font-medium bg-surface-raised text-secondary hover:bg-surface-hover hover:text-primary'
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {!filtered.length ? (
        <div className="rounded-xl border-2 border-dashed border-subtle py-10 text-center">
          <p className="text-sm text-secondary">
            {filter === 'all' ? 'No payments recorded yet.' : 'No payments with this status.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-subtle bg-surface text-left text-xs text-secondary">
                <th className="px-4 py-2.5 font-medium">Contact</th>
                <th className="px-4 py-2.5 font-medium">Service</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Payment date</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const meta = STATUS_META[p.status] ?? STATUS_META.pending;
                return (
                  <tr key={p.id} className="border-b border-subtle last:border-0 hover:bg-surface-raised">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-primary">{contactName(p.contact)}</p>
                      {p.contact?.email && (
                        <p className="text-xs text-muted truncate">{p.contact.email}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-primary">{p.service?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 font-semibold text-primary whitespace-nowrap">
                      {formatMoney(p.amount, p.currency)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-secondary whitespace-nowrap">{formatDate(p.paid_at)}</td>
                    <td className="px-4 py-2.5 text-secondary whitespace-nowrap">{formatDate(p.created_at)}</td>
                    <td className="px-4 py-2.5">
                      {p.status === 'pending' && p.checkout_url && (
                        <a
                          href={p.checkout_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover"
                          title="Open payment link"
                        >
                          Link <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
