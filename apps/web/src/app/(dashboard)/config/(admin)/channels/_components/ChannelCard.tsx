'use client';

import { useState } from 'react';
import { Settings, Radio, Power, Trash2, Loader2 } from 'lucide-react';
import { useUpdateChannel, useDeleteChannel, useTestChannelConnection } from '@/hooks/useChannels';
import type { Channel, TestConnectionResult } from '@/services/channels.service';
import { toast } from '@/hooks/useToast';
import { ChannelIcon } from '@/components/channel-icon';

interface Props {
  channel: Channel;
  onConfigure(): void;
}

export function ChannelCard({ channel, onConfigure }: Props) {
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const updateChannel = useUpdateChannel();
  const deleteChannel = useDeleteChannel();
  const testConnection = useTestChannelConnection();

  const handleToggle = () => {
    updateChannel.mutate({ id: channel.id, body: { is_active: !channel.is_active } });
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this channel?')) return;
    try {
      await deleteChannel.mutateAsync(channel.id);
      toast({ title: 'Channel deleted' });
    } catch {
      toast({ title: 'Error deleting channel', variant: 'error' });
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    try {
      const result = await testConnection.mutateAsync(channel.id);
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: 'Connection test failed' });
    }
  };

  // WhatsApp stores the WAHA session name in external_identifier — show the
  // linked number instead, which is what the user actually recognises.
  const phoneNumber = channel.config?.phone_number as string | undefined;
  const subtitle =
    channel.type === 'whatsapp'
      ? phoneNumber
        ? `+${phoneNumber}`
        : 'No number linked'
      : channel.external_identifier;

  return (
    <div className="bg-surface border border-subtle rounded-xl overflow-hidden flex flex-col">
      {/* Card body */}
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="w-9 h-9 rounded-tile border border-subtle bg-surface-raised flex items-center justify-center shrink-0">
          <ChannelIcon type={channel.type} className="h-[18px] w-[18px]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-primary capitalize">{channel.type}</p>
            <span className="text-[10px] bg-surface-raised text-secondary px-1.5 py-0.5 rounded-sm capitalize">
              {channel.provider}
            </span>
            <span
              className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                channel.is_active
                  ? 'bg-success/10 text-success'
                  : 'bg-surface-raised text-secondary'
              }`}
            >
              {channel.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <p className="text-xs text-muted truncate mt-0.5">{subtitle}</p>
        </div>
      </div>

      {/* Action bar */}
      <div className="border-t border-subtle px-3 py-1.5 flex items-center gap-0.5">
        <button
          onClick={onConfigure}
          className="flex items-center gap-1 text-xs text-secondary hover:text-accent-hover px-2 py-1 rounded-sm hover:bg-olive-dark transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          <span>Configure</span>
        </button>

        <button
          onClick={handleTest}
          disabled={testConnection.isPending}
          className="flex items-center gap-1 text-xs text-secondary hover:text-accent-hover px-2 py-1 rounded-sm hover:bg-olive-dark transition-colors"
        >
          {testConnection.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Radio className="h-3.5 w-3.5" />
          )}
          <span>Test</span>
        </button>

        <button
          onClick={handleToggle}
          disabled={updateChannel.isPending}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
            channel.is_active
              ? 'text-secondary hover:text-warning hover:bg-warning/10'
              : 'text-secondary hover:text-success hover:bg-success/10'
          }`}
        >
          <Power className="h-3.5 w-3.5" />
          <span>{channel.is_active ? 'Deactivate' : 'Activate'}</span>
        </button>

        <button
          onClick={handleDelete}
          disabled={deleteChannel.isPending}
          className="ml-auto p-1.5 text-muted hover:text-danger hover:bg-danger/10 rounded-sm transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`px-4 py-2 text-xs border-t ${
            testResult.success
              ? 'bg-success/10 text-success border-success/25'
              : 'bg-danger/10 text-danger border-danger/25'
          }`}
        >
          {testResult.success ? '✓' : '✗'} {testResult.message}
        </div>
      )}
    </div>
  );
}
