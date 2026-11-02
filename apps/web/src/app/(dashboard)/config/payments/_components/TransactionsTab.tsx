'use client';

import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { usePayments } from '@/hooks/usePayments';
import type { Payment, PaymentContact } from '@/services/payments.service';

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('es', {
    style: 'currency',
    currency: (currency || 'usd').toUpperCase(),
  }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function contactName(contact?: PaymentContact | null): string {
  if (!contact) return 'Contacto desconocido';
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Sin nombre';
}

const STATUS_META: Record<
  Payment['status'],
  { label: string; variant: 'success' | 'warn' | 'default' | 'destructive' }
> = {
  paid: { label: 'Pagado', variant: 'success' },
  pending: { label: 'Pendiente', variant: 'warn' },
  expired: { label: 'Expirado', variant: 'default' },
  canceled: { label: 'Cancelado', variant: 'default' },
  failed: { label: 'Fallido', variant: 'destructive' },
};

const FILTERS: { value: 'all' | Payment['status']; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'paid', label: 'Pagados' },
  { value: 'pending', label: 'Pendientes' },
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
          <div key={i} className="h-14 rounded-xl border border-border animate-pulse bg-panel" />
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
                ? 'px-3 py-1 rounded-full text-xs font-medium bg-blue-600 text-white'
                : 'px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200'
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {!filtered.length ? (
        <div className="rounded-xl border-2 border-dashed border-border py-10 text-center">
          <p className="text-sm text-gray-500">
            {filter === 'all' ? 'Todavía no hay pagos registrados.' : 'No hay pagos con este estado.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-panel text-left text-xs text-gray-500">
                <th className="px-4 py-2.5 font-medium">Contacto</th>
                <th className="px-4 py-2.5 font-medium">Servicio</th>
                <th className="px-4 py-2.5 font-medium">Monto</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 font-medium">Fecha de pago</th>
                <th className="px-4 py-2.5 font-medium">Creado</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const meta = STATUS_META[p.status] ?? STATUS_META.pending;
                return (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{contactName(p.contact)}</p>
                      {p.contact?.email && (
                        <p className="text-xs text-gray-400 truncate">{p.contact.email}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{p.service?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap">
                      {formatMoney(p.amount, p.currency)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{formatDate(p.paid_at)}</td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{formatDate(p.created_at)}</td>
                    <td className="px-4 py-2.5">
                      {p.status === 'pending' && p.checkout_url && (
                        <a
                          href={p.checkout_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                          title="Abrir link de pago"
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
