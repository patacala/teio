'use client';

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateChannel } from '@/hooks/useChannels';
import { useCurrentUser } from '@/hooks/useTeam';
import type { Channel } from '@/services/channels.service';
import { toast } from '@/hooks/useToast';
import { API_URL } from '@/lib/api-client';

interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'readonly';
  required?: boolean;
}

interface ProviderConfig {
  id: string;
  label: string;
  fields: ConfigField[];
}

interface ChannelTypeConfig {
  label: string;
  icon: string;
  identifierLabel: string;
  identifierPlaceholder: string;
  providers: ProviderConfig[];
}

// Channels that use the new generic webhook router
const CHANNEL_WEBHOOK_TYPES = new Set(['facebook', 'whatsapp', 'instagram', 'sms']);

function getWebhookUrl(channelType: string): string {
  if (channelType === 'voice') {
    // Retell connects over the Custom LLM WebSocket, not an HTTP webhook;
    // Retell appends /{call_id} to this base.
    return `${API_URL.replace(/^http/, 'ws')}/llm-websocket`;
  }
  if (CHANNEL_WEBHOOK_TYPES.has(channelType)) {
    return `${API_URL}/api/v1/webhooks/channel/${channelType}`;
  }
  return `${API_URL}/api/v1/messages/incoming`;
}

/**
 * WhatsApp is linked by scanning a QR (WAHA), not by filling a credentials
 * form, so it has no providers here — selecting it hands off to
 * WhatsAppLinkDialog via `onSelectWhatsApp`.
 */
const WHATSAPP_TILE = { label: 'WhatsApp', icon: '💬' };

const CHANNEL_CONFIG: Record<string, ChannelTypeConfig> = {
  facebook: {
    label: 'Facebook',
    icon: '📘',
    identifierLabel: 'Facebook Page ID',
    identifierPlaceholder: '123456789012345',
    providers: [
      {
        id: 'facebook',
        label: 'Meta',
        fields: [
          { key: 'page_access_token', label: 'Page Access Token', type: 'password' },
          { key: 'app_secret', label: 'App Secret (opcional)', type: 'password' },
          { key: 'verify_token', label: 'Verify Token — copiar al dashboard de Facebook', type: 'readonly' },
          { key: 'webhook_url', label: 'Webhook URL — copiar al dashboard de Facebook', type: 'readonly' },
        ],
      },
    ],
  },
  sms: {
    label: 'SMS',
    icon: '📱',
    identifierLabel: 'Phone number',
    identifierPlaceholder: '+1234567890',
    providers: [
      {
        id: 'twilio',
        label: 'Twilio',
        fields: [
          { key: 'account_sid', label: 'Account SID', type: 'text' },
          { key: 'api_key', label: 'Auth Token', type: 'password' },
          { key: 'webhook_url', label: 'Webhook URL', type: 'readonly' },
        ],
      },
      {
        id: 'telnyx',
        label: 'Telnyx',
        fields: [
          { key: 'api_key', label: 'API Key (KEY_xxx)', type: 'password' },
          { key: 'from_number', label: 'From Number (E.164)', type: 'text' },
          { key: 'messaging_profile_id', label: 'Messaging Profile ID (opcional)', type: 'text' },
          { key: 'webhook_url', label: 'Webhook URL', type: 'readonly' },
        ],
      },
      {
        id: 'vonage',
        label: 'Vonage',
        fields: [
          { key: 'api_key', label: 'API Key', type: 'text' },
          { key: 'api_secret', label: 'API Secret', type: 'password' },
          { key: 'webhook_url', label: 'Webhook URL', type: 'readonly' },
        ],
      },
    ],
  },
  email: {
    label: 'Email',
    icon: '📧',
    identifierLabel: 'From email address',
    identifierPlaceholder: 'hello@company.com',
    providers: [
      {
        id: 'sendgrid',
        label: 'SendGrid',
        fields: [{ key: 'api_key', label: 'API Key', type: 'password' }],
      },
      {
        id: 'resend',
        label: 'Resend',
        fields: [
          { key: 'api_key', label: 'API Key', type: 'password' },
          { key: 'domain', label: 'Domain', type: 'text' },
        ],
      },
      {
        id: 'smtp',
        label: 'SMTP',
        fields: [
          { key: 'smtp_host', label: 'SMTP Host', type: 'text' },
          { key: 'smtp_port', label: 'SMTP Port', type: 'number' },
          { key: 'username', label: 'Username', type: 'text' },
          { key: 'password', label: 'Password', type: 'password' },
        ],
      },
    ],
  },
  instagram: {
    label: 'Instagram',
    icon: '📷',
    identifierLabel: 'Instagram Business Account ID',
    identifierPlaceholder: '123456789012345',
    providers: [
      {
        id: 'meta',
        label: 'Meta',
        fields: [
          { key: 'page_access_token', label: 'Page Access Token', type: 'password' },
          { key: 'app_secret', label: 'App Secret (opcional)', type: 'password' },
          { key: 'verify_token', label: 'Verify Token — copiar al dashboard de Meta', type: 'readonly' },
          { key: 'webhook_url', label: 'Webhook URL — copiar al dashboard de Meta', type: 'readonly' },
        ],
      },
    ],
  },
  webchat: {
    label: 'Web Chat',
    icon: '🌐',
    identifierLabel: 'Widget name',
    identifierPlaceholder: 'My website chat',
    providers: [
      {
        id: 'custom',
        label: 'Custom',
        fields: [{ key: 'widget_id', label: 'Widget ID (auto-generated)', type: 'readonly' }],
      },
    ],
  },
  voice: {
    label: 'Voice',
    icon: '📞',
    // Voice has no generic identifier row; the inbound agent id (captured as a
    // config field below) becomes the channel's external identifier.
    identifierLabel: 'Retell Inbound Agent ID',
    identifierPlaceholder: 'agent_abc123... (recibe llamadas)',
    providers: [
      {
        id: 'retell',
        label: 'Retell AI',
        fields: [
          { key: 'inbound_agent_id', label: 'Retell Inbound Agent ID (recibe llamadas)', type: 'text', required: true },
          { key: 'outbound_agent_id', label: 'Retell Outbound Agent ID (hace llamadas salientes)', type: 'text' },
          { key: 'agent_name', label: 'Nombre del agente (ej. Ventas, Soporte)', type: 'text' },
          { key: 'api_key', label: 'Retell API Key', type: 'password' },
          { key: 'webhook_url', label: 'Custom LLM WebSocket URL — copiar a Retell', type: 'readonly' },
        ],
      },
    ],
  },
};

type Step = 'type' | 'provider' | 'config';

interface Props {
  open: boolean;
  onClose(): void;
  onCreated?: (channel: Channel) => void;
  /** Called instead of the generic form when the user picks WhatsApp. */
  onSelectWhatsApp(): void;
}

export function ChannelWizard({ open, onClose, onCreated, onSelectWhatsApp }: Props) {
  const createChannel = useCreateChannel();
  const { data: currentUser } = useCurrentUser();
  const isPlatformAdmin = (currentUser as any)?.is_platform_admin === true;

  const visibleChannelConfig = useMemo(() => {
    if (isPlatformAdmin) return CHANNEL_CONFIG;
    const { email: _email, ...rest } = CHANNEL_CONFIG;
    return rest;
  }, [isPlatformAdmin]);
  const [step, setStep] = useState<Step>('type');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [configValues, setConfigValues] = useState<Record<string, string>>({});

  const reset = () => {
    setStep('type');
    setSelectedType(null);
    setSelectedProvider(null);
    setIdentifier('');
    setConfigValues({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const initConfig = (fields: ConfigField[], channelType: string): Record<string, string> => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      if (field.type === 'readonly') {
        if (field.key === 'webhook_url') initial[field.key] = getWebhookUrl(channelType);
        else if (field.key === 'widget_id') initial[field.key] = crypto.randomUUID();
        else if (field.key === 'verify_token') initial[field.key] = crypto.randomUUID();
      }
    }
    return initial;
  };

  const handleTypeSelect = (type: string) => {
    setSelectedType(type);
    const providers = CHANNEL_CONFIG[type].providers;
    if (providers.length === 1) {
      setSelectedProvider(providers[0].id);
      setConfigValues(initConfig(providers[0].fields, type));
      setStep('config');
    } else {
      setStep('provider');
    }
  };

  const handleProviderSelect = (provider: string) => {
    setSelectedProvider(provider);
    const providerConfig = CHANNEL_CONFIG[selectedType!].providers.find((p) => p.id === provider)!;
    setConfigValues(initConfig(providerConfig.fields, selectedType!));
    setStep('config');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || !selectedProvider) return;
    // Voice resolves the org by the Retell inbound agent id, so that becomes the
    // channel's external identifier instead of the generic identifier input.
    const externalIdentifier =
      selectedType === 'voice'
        ? configValues.inbound_agent_id?.trim() || configValues.outbound_agent_id?.trim() || ''
        : identifier;
    if (!externalIdentifier) {
      toast({ title: 'Falta el Retell Inbound Agent ID', variant: 'error' });
      return;
    }
    try {
      const channel = await createChannel.mutateAsync({
        type: selectedType,
        provider: selectedProvider,
        external_identifier: externalIdentifier,
        config: configValues,
      });
      toast({ title: 'Canal creado' });
      onCreated?.(channel);
      handleClose();
    } catch {
      toast({ title: 'Error al crear canal', variant: 'error' });
    }
  };

  const typeConfig = selectedType ? CHANNEL_CONFIG[selectedType] : null;
  const providerConfig =
    typeConfig && selectedProvider
      ? typeConfig.providers.find((p) => p.id === selectedProvider)
      : null;

  const stepTitle = () => {
    if (step === 'type') return 'Agregar canal';
    if (step === 'provider') return `${typeConfig?.label ?? ''} — Seleccionar proveedor`;
    return `Configurar ${typeConfig?.label ?? ''}`;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{stepTitle()}</DialogTitle>
        </DialogHeader>

        {/* Step 1: Type selector */}
        {step === 'type' && (
          <div className="grid grid-cols-2 gap-3 mt-2 sm:grid-cols-3">
            {/* WhatsApp: QR flow, not the generic credentials form */}
            <button
              onClick={() => {
                handleClose();
                onSelectWhatsApp();
              }}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-blue-300 hover:bg-blue-50 transition-colors text-center"
            >
              <span className="text-2xl">{WHATSAPP_TILE.icon}</span>
              <span className="text-sm font-medium text-gray-900">{WHATSAPP_TILE.label}</span>
            </button>

            {Object.entries(visibleChannelConfig).map(([type, cfg]) => (
              <button
                key={type}
                onClick={() => handleTypeSelect(type)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-blue-300 hover:bg-blue-50 transition-colors text-center"
              >
                <span className="text-2xl">{cfg.icon}</span>
                <span className="text-sm font-medium text-gray-900">{cfg.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Provider selector */}
        {step === 'provider' && typeConfig && (
          <div className="space-y-2 mt-2">
            {typeConfig.providers.map((p) => (
              <button
                key={p.id}
                onClick={() => handleProviderSelect(p.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
              >
                <span className="text-sm font-medium text-gray-900">{p.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setStep('type')}
              className="text-xs text-gray-400 hover:text-gray-600 mt-2 block"
            >
              ← Back
            </button>
          </div>
        )}

        {/* Step 3: Config form */}
        {step === 'config' && typeConfig && providerConfig && (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {selectedType !== 'voice' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {typeConfig.identifierLabel}
                </label>
                <Input
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={typeConfig.identifierPlaceholder}
                />
              </div>
            )}

            {providerConfig.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {field.label}
                </label>
                {field.type === 'readonly' ? (
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={configValues[field.key] ?? ''}
                      className="bg-gray-50 text-gray-500 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard.writeText(configValues[field.key] ?? '')
                      }
                      className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded border border-border hover:bg-blue-50 shrink-0"
                    >
                      Copy
                    </button>
                  </div>
                ) : (
                  <Input
                    required={field.required}
                    type={
                      field.type === 'password'
                        ? 'password'
                        : field.type === 'number'
                          ? 'number'
                          : 'text'
                    }
                    value={configValues[field.key] ?? ''}
                    onChange={(e) =>
                      setConfigValues((v) => ({ ...v, [field.key]: e.target.value }))
                    }
                    placeholder={field.type === 'password' ? '••••••••' : ''}
                  />
                )}
              </div>
            ))}

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  if (typeConfig.providers.length > 1) setStep('provider');
                  else setStep('type');
                }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ← Back
              </button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={createChannel.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {createChannel.isPending ? 'Creando…' : 'Crear canal'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
