'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { ChannelIcon } from '@/components/channel-icon';
import { Input } from '@/components/ui/input';
import { useUpdateChannel, useTestChannelConnection } from '@/hooks/useChannels';
import type { Channel, TestConnectionResult } from '@/services/channels.service';
import { toast } from '@/hooks/useToast';
import { API_URL } from '@/lib/api-client';
import { WhatsAppChannelPanel } from './WhatsAppChannelPanel';

const SENSITIVE_FIELDS = ['api_key', 'password', 'access_token', 'api_secret', 'auth_token'];

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'readonly';
}

const CHANNEL_FIELDS: Record<string, FieldDef[]> = {
  'facebook/facebook': [
    { key: 'page_access_token', label: 'Page Access Token', type: 'password' },
    { key: 'app_secret', label: 'App Secret (optional)', type: 'password' },
    { key: 'verify_token', label: 'Verify Token', type: 'readonly' },
  ],
  'instagram/meta': [
    { key: 'page_access_token', label: 'Page Access Token', type: 'password' },
    { key: 'app_secret', label: 'App Secret (optional)', type: 'password' },
    { key: 'verify_token', label: 'Verify Token', type: 'readonly' },
  ],
  'sms/twilio': [
    { key: 'account_sid', label: 'Account SID', type: 'text' },
    { key: 'api_key', label: 'Auth Token', type: 'password' },
  ],
  'sms/vonage': [
    { key: 'api_key', label: 'API Key', type: 'text' },
    { key: 'api_secret', label: 'API Secret', type: 'password' },
  ],
  'email/sendgrid': [{ key: 'api_key', label: 'API Key', type: 'password' }],
  'email/resend': [
    { key: 'api_key', label: 'API Key', type: 'password' },
    { key: 'domain', label: 'Domain', type: 'text' },
  ],
  'email/smtp': [
    { key: 'smtp_host', label: 'SMTP Host', type: 'text' },
    { key: 'smtp_port', label: 'SMTP Port', type: 'number' },
    { key: 'username', label: 'Username', type: 'text' },
    { key: 'password', label: 'Password', type: 'password' },
  ],
  'webchat/custom': [{ key: 'widget_id', label: 'Widget ID', type: 'readonly' }],
  'voice/retell': [
    { key: 'inbound_agent_id', label: 'Retell Inbound Agent ID (receives calls)', type: 'text' },
    { key: 'outbound_agent_id', label: 'Retell Outbound Agent ID (places outbound calls)', type: 'text' },
    { key: 'agent_name', label: 'Agent name (e.g. Sales, Support)', type: 'text' },
    { key: 'api_key', label: 'Retell API Key', type: 'password' },
  ],
};

const CHANNEL_WEBHOOK_TYPES = new Set(['facebook', 'whatsapp', 'instagram', 'sms']);

function getWebhookUrl(channelType: string): string {
  // Retell connects to ProSales over the Custom LLM WebSocket, not an HTTP
  // webhook; Retell appends /{call_id} to this base.
  if (channelType === 'voice') {
    return `${API_URL.replace(/^http/, 'ws')}/llm-websocket`;
  }
  if (CHANNEL_WEBHOOK_TYPES.has(channelType)) {
    return `${API_URL}/api/v1/webhooks/channel/${channelType}`;
  }
  return `${API_URL}/api/v1/messages/incoming`;
}

interface Props {
  channel: Channel | null;
  open: boolean;
  onClose(): void;
  /** Opens the QR dialog for a WhatsApp channel that needs (re)linking. */
  onLinkWhatsApp(channelId: string): void;
}

export function ChannelConfigDrawer({ channel, open, onClose, onLinkWhatsApp }: Props) {
  const updateChannel = useUpdateChannel();
  const testConnection = useTestChannelConnection();
  const [configDraft, setConfigDraft] = useState<Record<string, string>>({});
  const [identifierDraft, setIdentifierDraft] = useState('');
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  useEffect(() => {
    if (channel) {
      const draft: Record<string, string> = {};
      const config = channel.config as Record<string, string>;
      for (const [key, value] of Object.entries(config)) {
        // Show empty for sensitive masked values so user can re-enter
        if (SENSITIVE_FIELDS.includes(key) && value === '***') {
          draft[key] = '';
        } else {
          draft[key] = String(value ?? '');
        }
      }
      // Legacy voice channels stored the inbound agent id only as the external
      // identifier; surface it in the editable field so it can be updated.
      if (channel.type === 'voice' && !draft.inbound_agent_id && channel.external_identifier) {
        draft.inbound_agent_id = channel.external_identifier;
      }
      setConfigDraft(draft);
      setIdentifierDraft(channel.external_identifier ?? '');
      setTestResult(null);
    }
  }, [channel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!channel) return null;

  const channelKey = `${channel.type}/${channel.provider}`;
  const fields = CHANNEL_FIELDS[channelKey] ?? [];
  // WhatsApp is linked by QR, not by editing credentials — it gets its own panel
  const isWhatsApp = channel.type === 'whatsapp';

  const handleSave = async () => {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(configDraft)) {
      if (value !== '' && value !== '***') {
        filtered[key] = value;
      }
    }
    const body: Record<string, unknown> = { config: filtered };
    // Voice resolves the org by the inbound agent id, so keep the external
    // identifier in sync with it instead of the generic identifier field.
    if (channel.type === 'voice') {
      const inbound = (configDraft.inbound_agent_id ?? '').trim();
      if (inbound && inbound !== channel.external_identifier) {
        body.external_identifier = inbound;
      }
    } else if (identifierDraft && identifierDraft !== channel.external_identifier) {
      body.external_identifier = identifierDraft;
    }
    try {
      await updateChannel.mutateAsync({ id: channel.id, body });
      toast({ title: 'Changes saved' });
      onClose();
    } catch {
      toast({ title: 'Error saving', variant: 'error' });
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

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="overflow-y-auto flex flex-col">
        <DrawerHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-tile border border-subtle bg-surface-raised">
              <ChannelIcon type={channel.type} />
            </span>
            <div>
              <DrawerTitle className="capitalize">{channel.type}</DrawerTitle>
              <p className="text-xs text-secondary capitalize">{channel.provider}</p>
            </div>
          </div>
        </DrawerHeader>

        {isWhatsApp ? (
          <div className="flex-1 overflow-y-auto">
            <WhatsAppChannelPanel channel={channel} onLink={onLinkWhatsApp} />
          </div>
        ) : (
        <div className="flex-1 space-y-4 overflow-y-auto">
          {/* Editable identifier — voice derives it from the inbound agent id */}
          {channel.type !== 'voice' && (
            <div>
              <label className="block text-xs font-medium text-primary mb-1">Identifier</label>
              <Input
                value={identifierDraft}
                onChange={(e) => setIdentifierDraft(e.target.value)}
                className="text-sm"
              />
            </div>
          )}

          {/* Dynamic config fields */}
          {fields.map((field) => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-primary mb-1">{field.label}</label>
              {field.type === 'readonly' ? (
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={configDraft[field.key] ?? ''}
                    className="bg-surface-raised text-secondary text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(configDraft[field.key] ?? '')}
                    className="text-xs text-secondary hover:text-accent-hover px-2 py-1 rounded-sm border border-subtle hover:bg-olive-dark shrink-0"
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <Input
                  type={
                    field.type === 'password'
                      ? 'password'
                      : field.type === 'number'
                        ? 'number'
                        : 'text'
                  }
                  value={configDraft[field.key] ?? ''}
                  onChange={(e) =>
                    setConfigDraft((d) => ({ ...d, [field.key]: e.target.value }))
                  }
                  placeholder={SENSITIVE_FIELDS.includes(field.key) ? 'Re-enter to update' : ''}
                />
              )}
            </div>
          ))}

          {/* Test connection */}
          <div className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testConnection.isPending}
              className="gap-1.5"
            >
              {testConnection.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Test connection
            </Button>
            {testResult && (
              <p
                className={`mt-2 text-xs ${testResult.success ? 'text-success' : 'text-danger'}`}
              >
                {testResult.success ? '✓' : '✗'} {testResult.message}
              </p>
            )}
          </div>

          {/* Webhook URL — computed per channel type (WebSocket for voice) */}
          <div>
            <label className="block text-xs font-medium text-primary mb-1">
              {channel.type === 'voice' ? 'Custom LLM WebSocket URL (Retell)' : 'Webhook URL'}
            </label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={getWebhookUrl(channel.type)}
                className="bg-surface-raised text-secondary text-xs"
              />
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(getWebhookUrl(channel.type))}
                className="text-xs text-secondary hover:text-accent-hover px-2 py-1 rounded-sm border border-subtle hover:bg-olive-dark shrink-0"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
        )}

        <DrawerFooter>
          {isWhatsApp ? (
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateChannel.isPending}
                size="sm"
                className="bg-accent hover:bg-accent-hover text-on-accent"
              >
                {updateChannel.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
