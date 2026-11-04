'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Mail, MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDeliveries } from '@/hooks/useCommunications';
import { useCurrentUser } from '@/hooks/useTeam';
import { useImpersonation } from '@/contexts/impersonation-context';
import { formatEventLabel } from './template-helpers';

export function DeliveryLogTable() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useDeliveries(page, 20);
  const { data: currentUser } = useCurrentUser();
  const { isImpersonating } = useImpersonation();
  const isPlatformAdmin = currentUser?.is_platform_admin === true && !isImpersonating;

  const deliveries = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="rounded-xl border border-subtle bg-surface shadow-xs overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-subtle">
        <div className="w-8 h-8 rounded-lg bg-olive-dark flex items-center justify-center">
          <Send className="h-4 w-4 text-accent" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-primary">Delivery history</h3>
          <p className="text-[11px] text-muted">Log of sent notifications</p>
        </div>
      </div>

      {isLoading ? (
        <div className="px-5 py-12 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-surface-raised rounded-lg animate-pulse" />
          ))}
        </div>
      ) : deliveries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-5">
          <div className="w-10 h-10 rounded-full bg-surface-raised flex items-center justify-center mb-3">
            <Send className="h-5 w-5 text-muted" />
          </div>
          <p className="text-sm text-secondary">No deliveries yet</p>
          <p className="text-[11px] text-muted mt-0.5">Deliveries will appear here when events fire</p>
        </div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-subtle bg-surface-raised/60">
                <th className="text-left text-[11px] font-medium text-secondary uppercase tracking-wider px-5 py-3">Event</th>
                <th className="text-left text-[11px] font-medium text-secondary uppercase tracking-wider px-5 py-3">Recipient</th>
                <th className="text-left text-[11px] font-medium text-secondary uppercase tracking-wider px-5 py-3">Channel</th>
                {isPlatformAdmin && (
                  <th className="text-left text-[11px] font-medium text-secondary uppercase tracking-wider px-5 py-3">Provider</th>
                )}
                <th className="text-left text-[11px] font-medium text-secondary uppercase tracking-wider px-5 py-3">Status</th>
                <th className="text-left text-[11px] font-medium text-secondary uppercase tracking-wider px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle/60">
              {deliveries.map((d) => (
                <tr key={d.id} className="group hover:bg-olive-dark/30 transition-colors">
                  <td className="px-5 py-3">
                    <span className="text-[12px] font-medium text-primary bg-surface-raised px-2 py-0.5 rounded-md">
                      {formatEventLabel(d.event_type)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-primary truncate max-w-[200px]">
                    {d.recipient}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1 text-[12px] text-secondary">
                      {d.channel_type === 'email' ? (
                        <Mail className="h-3 w-3" />
                      ) : (
                        <MessageSquare className="h-3 w-3" />
                      )}
                      {d.channel_type}
                    </span>
                  </td>
                  {isPlatformAdmin && (
                    <td className="px-5 py-3 text-[13px] text-secondary">{d.provider}</td>
                  )}
                  <td className="px-5 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-5 py-3 text-[12px] text-muted">
                    {new Date(d.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-subtle bg-surface-raised/30">
              <span className="text-xs text-secondary">
                Page {meta.page} of {meta.totalPages} ({meta.total} total)
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="h-7 w-7 p-0"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage(page + 1)}
                  className="h-7 w-7 p-0"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    sent: 'bg-success/10 text-success border-success/25',
    delivered: 'bg-success/10 text-success border-success/25',
    pending: 'bg-warning/10 text-warning border-warning/25',
    failed: 'bg-danger/10 text-danger border-danger/25',
    bounced: 'bg-danger/10 text-danger border-danger/25',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${styles[status] ?? 'bg-surface-raised text-secondary border-subtle'}`}>
      {status}
    </span>
  );
}
