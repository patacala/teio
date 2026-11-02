'use client';

import { Loader2, CheckCircle2, XCircle, Link2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWhatsAppStatus, useUnlinkWhatsApp, useRelinkWhatsApp } from '@/hooks/useChannels';
import type { Channel } from '@/services/channels.service';
import { toast } from '@/hooks/useToast';

interface Props {
  channel: Channel;
  /** Opens WhatsAppLinkDialog for this channel so a number can be scanned. */
  onLink(channelId: string): void;
}

export function WhatsAppChannelPanel({ channel, onLink }: Props) {
  const { data: state, isLoading } = useWhatsAppStatus(channel.id);
  const unlink = useUnlinkWhatsApp();
  const relink = useRelinkWhatsApp();

  const connected = state?.connected ?? false;

  const handleUnlink = async () => {
    if (!window.confirm('¿Desvincular este número? Dejarás de recibir y enviar mensajes.')) return;
    try {
      await unlink.mutateAsync(channel.id);
      toast({ title: 'Número desvinculado' });
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'error' });
    }
  };

  const handleRelink = async () => {
    try {
      await relink.mutateAsync(channel.id);
      onLink(channel.id);
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'error' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 py-6">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Consultando estado…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connection state */}
      <div
        className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
          connected
            ? 'bg-emerald-50 border-emerald-100'
            : 'bg-gray-50 border-border'
        }`}
      >
        {connected ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
        )}
        <div className="min-w-0">
          <p
            className={`text-sm font-medium ${
              connected ? 'text-emerald-700' : 'text-gray-900'
            }`}
          >
            {connected ? 'Conectado' : 'Sin vincular'}
          </p>
          {state?.phone_number ? (
            <p className="text-xs text-gray-500 mt-0.5">
              +{state.phone_number}
              {state.push_name ? ` · ${state.push_name}` : ''}
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-0.5">
              Escaneá el código QR para vincular un número.
            </p>
          )}
        </div>
      </div>

      {/* Session name — read-only, this is the WAHA session id, not the number */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Sesión WAHA</label>
        <p className="text-xs text-gray-400 font-mono truncate">{channel.external_identifier}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {connected ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUnlink}
            disabled={unlink.isPending}
            className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            {unlink.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Unlink className="h-3.5 w-3.5" />
            )}
            Desvincular
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={handleRelink}
            disabled={relink.isPending}
            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {relink.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            Vincular número
          </Button>
        )}
      </div>
    </div>
  );
}
