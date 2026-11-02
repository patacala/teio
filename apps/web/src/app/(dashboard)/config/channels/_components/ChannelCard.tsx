'use client';

import { useState } from 'react';
import { Settings, Radio, Power, Trash2, Loader2 } from 'lucide-react';
import { useUpdateChannel, useDeleteChannel, useTestChannelConnection } from '@/hooks/useChannels';
import type { Channel, TestConnectionResult } from '@/services/channels.service';
import { toast } from '@/hooks/useToast';

const CHANNEL_EMOJI: Record<string, string> = {
  whatsapp: '💬',
  facebook: '📘',
  instagram: '📷',
  sms: '📱',
  email: '📧',
  webchat: '🌐',
  voice: '🎙️',
};

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
    if (!window.confirm('¿Eliminar este canal?')) return;
    try {
      await deleteChannel.mutateAsync(channel.id);
      toast({ title: 'Canal eliminado' });
    } catch {
      toast({ title: 'Error al eliminar canal', variant: 'error' });
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
        : 'Sin número vinculado'
      : channel.external_identifier;

  return (
    <div className="bg-panel border border-border rounded-xl overflow-hidden flex flex-col">
      {/* Card body */}
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-xl shrink-0">
          {CHANNEL_EMOJI[channel.type] ?? '🔌'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 capitalize">{channel.type}</p>
            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded capitalize">
              {channel.provider}
            </span>
            <span
              className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                channel.is_active
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {channel.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <p className="text-xs text-gray-400 truncate mt-0.5">{subtitle}</p>
        </div>
      </div>

      {/* Action bar */}
      <div className="border-t border-border px-3 py-1.5 flex items-center gap-0.5">
        <button
          onClick={onConfigure}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          <span>Configure</span>
        </button>

        <button
          onClick={handleTest}
          disabled={testConnection.isPending}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
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
              ? 'text-gray-500 hover:text-orange-600 hover:bg-orange-50'
              : 'text-gray-500 hover:text-emerald-600 hover:bg-emerald-50'
          }`}
        >
          <Power className="h-3.5 w-3.5" />
          <span>{channel.is_active ? 'Deactivate' : 'Activate'}</span>
        </button>

        <button
          onClick={handleDelete}
          disabled={deleteChannel.isPending}
          className="ml-auto p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`px-4 py-2 text-xs border-t ${
            testResult.success
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-red-50 text-red-700 border-red-100'
          }`}
        >
          {testResult.success ? '✓' : '✗'} {testResult.message}
        </div>
      )}
    </div>
  );
}
