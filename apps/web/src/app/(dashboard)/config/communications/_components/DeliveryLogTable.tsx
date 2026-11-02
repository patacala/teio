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
  const isPlatformAdmin = (currentUser as any)?.is_platform_admin === true && !isImpersonating;

  const deliveries = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="rounded-xl border border-border bg-panel shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
          <Send className="h-4 w-4 text-blue-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Historial de envíos</h3>
          <p className="text-[11px] text-gray-400">Registro de notificaciones enviadas</p>
        </div>
      </div>

      {isLoading ? (
        <div className="px-5 py-12 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : deliveries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-5">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <Send className="h-5 w-5 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">Sin envíos registrados</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Los envíos aparecerán aquí cuando se disparen eventos</p>
        </div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50/60">
                <th className="text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Evento</th>
                <th className="text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Destinatario</th>
                <th className="text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Canal</th>
                {isPlatformAdmin && (
                  <th className="text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Proveedor</th>
                )}
                <th className="text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Estado</th>
                <th className="text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {deliveries.map((d) => (
                <tr key={d.id} className="group hover:bg-blue-50/30 transition-colors">
                  <td className="px-5 py-3">
                    <span className="text-[12px] font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md">
                      {formatEventLabel(d.event_type)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-gray-700 truncate max-w-[200px]">
                    {d.recipient}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1 text-[12px] text-gray-500">
                      {d.channel_type === 'email' ? (
                        <Mail className="h-3 w-3" />
                      ) : (
                        <MessageSquare className="h-3 w-3" />
                      )}
                      {d.channel_type}
                    </span>
                  </td>
                  {isPlatformAdmin && (
                    <td className="px-5 py-3 text-[13px] text-gray-500">{d.provider}</td>
                  )}
                  <td className="px-5 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-5 py-3 text-[12px] text-gray-400">
                    {new Date(d.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-gray-50/30">
              <span className="text-xs text-gray-500">
                Página {meta.page} de {meta.totalPages} ({meta.total} total)
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
    sent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
    bounced: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${styles[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
      {status}
    </span>
  );
}
