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
    if (!window.confirm('Unlink this number? You will stop receiving and sending messages.')) return;
    try {
      await unlink.mutateAsync(channel.id);
      toast({ title: 'Number unlinked' });
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
      <div className="flex items-center gap-2 text-xs text-secondary py-6">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking status…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connection state */}
      <div
        className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
          connected
            ? 'bg-success/10 border-success/25'
            : 'bg-surface-raised border-subtle'
        }`}
      >
        {connected ? (
          <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-muted mt-0.5 shrink-0" />
        )}
        <div className="min-w-0">
          <p
            className={`text-sm font-medium ${
              connected ? 'text-success' : 'text-primary'
            }`}
          >
            {connected ? 'Connected' : 'Not linked'}
          </p>
          {state?.phone_number ? (
            <p className="text-xs text-secondary mt-0.5">
              +{state.phone_number}
              {state.push_name ? ` · ${state.push_name}` : ''}
            </p>
          ) : (
            <p className="text-xs text-secondary mt-0.5">
              Scan the QR code to link a number.
            </p>
          )}
        </div>
      </div>

      {/* Session name — read-only, this is the WAHA session id, not the number */}
      <div>
        <label className="block text-xs font-medium text-primary mb-1">WAHA session</label>
        <p className="text-xs text-muted font-mono truncate">{channel.external_identifier}</p>
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
            className="gap-1.5 text-danger hover:text-danger hover:bg-danger/10"
          >
            {unlink.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Unlink className="h-3.5 w-3.5" />
            )}
            Unlink
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={handleRelink}
            disabled={relink.isPending}
            className="gap-1.5 bg-accent hover:bg-accent-hover text-on-accent"
          >
            {relink.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            Link number
          </Button>
        )}
      </div>
    </div>
  );
}
