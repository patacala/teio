'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer';
import { useWebhookLogs } from '@/hooks/useWebhooks';
import type { WebhookLog } from '@/services/webhooks.service';

interface Props {
  webhookId: string | null;
  webhookName: string;
  open: boolean;
  onClose: () => void;
}

function StatusBadge({ succeeded }: { succeeded: boolean | null }) {
  if (succeeded === true) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">
        Entregado
      </span>
    );
  }
  if (succeeded === false) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600">
        Fallido
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
      —
    </span>
  );
}

function LogRow({ log }: { log: WebhookLog }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="shrink-0 text-gray-400">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="text-xs font-medium text-gray-900">{log.event_type}</span>
        </span>
        <StatusBadge succeeded={log.succeeded} />
        <span className="text-[10px] text-gray-400 shrink-0">
          {log.status_code ?? '—'}
        </span>
        <span className="text-[10px] text-gray-400 shrink-0">
          {log.duration_ms != null ? `${log.duration_ms}ms` : '—'}
        </span>
        <span className="text-[10px] text-gray-400 shrink-0">
          {new Date(log.delivered_at).toLocaleString('es', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border bg-gray-50 px-3 py-3 space-y-3">
          <div>
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">Payload</p>
            <pre className="text-[11px] text-gray-700 overflow-x-auto bg-white border border-border rounded p-2 max-h-48">
              {JSON.stringify(log.payload, null, 2)}
            </pre>
          </div>

          {log.response_body && (
            <div>
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">Respuesta</p>
              <pre className="text-[11px] text-gray-700 overflow-x-auto bg-white border border-border rounded p-2 max-h-32">
                {log.response_body}
              </pre>
            </div>
          )}

          {log.error_message && (
            <div>
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">Error</p>
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
                {log.error_message}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function WebhookLogsDrawer({ webhookId, webhookName, open, onClose }: Props) {
  const { data: logs, isLoading } = useWebhookLogs(open ? webhookId : null);

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent className="max-w-lg overflow-y-auto">
        <DrawerHeader>
          <DrawerTitle>{webhookName} — Historial de entregas</DrawerTitle>
        </DrawerHeader>

        <div className="space-y-2">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />
            ))
          ) : !logs?.length ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-500">Sin entregas registradas aún.</p>
            </div>
          ) : (
            logs.map((log) => <LogRow key={log.id} log={log} />)
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
