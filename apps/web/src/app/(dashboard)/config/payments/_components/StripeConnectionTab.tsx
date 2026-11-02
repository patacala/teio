'use client';

import { useEffect, useState } from 'react';
import { Copy, Check, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePaymentSettings, useUpdatePaymentSettings } from '@/hooks/usePayments';
import { toast } from '@/hooks/useToast';

const CURRENCIES = ['usd', 'eur', 'mxn', 'cop', 'ars', 'clp', 'pen', 'brl'];

export function StripeConnectionTab() {
  const { data: settings, isLoading } = usePaymentSettings();
  const update = useUpdatePaymentSettings();

  const [form, setForm] = useState({ stripe_secret_key: '', stripe_webhook_secret: '', currency: 'usd' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (settings) setForm((f) => ({ ...f, currency: settings.currency }));
  }, [settings?.currency]);

  // Computed server-side (organization id comes from the authenticated tenant context,
  // never guessed on the frontend) — see PaymentSettingsService.getMasked().
  const webhookUrl = settings?.webhook_url ?? '';
  const webhookUrlReady = Boolean(webhookUrl);

  const handleCopy = () => {
    if (!webhookUrlReady) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = async () => {
    try {
      const body: Record<string, string> = { currency: form.currency };
      if (form.stripe_secret_key.trim()) body.stripe_secret_key = form.stripe_secret_key.trim();
      if (form.stripe_webhook_secret.trim()) body.stripe_webhook_secret = form.stripe_webhook_secret.trim();
      await update.mutateAsync(body);
      setForm((f) => ({ ...f, stripe_secret_key: '', stripe_webhook_secret: '' }));
      toast({ title: 'Configuración de Stripe guardada', variant: 'default' });
    } catch {
      toast({ title: 'Error al guardar la configuración', variant: 'error' });
    }
  };

  if (isLoading) {
    return <div className="h-64 rounded-xl border border-border animate-pulse bg-panel max-w-xl" />;
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
          settings?.is_connected ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
        }`}
      >
        {settings?.is_connected ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
        {settings?.is_connected ? 'Stripe conectado' : 'Stripe no configurado todavía'}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Secret Key de Stripe</label>
        <Input
          type="password"
          value={form.stripe_secret_key}
          onChange={(e) => setForm((f) => ({ ...f, stripe_secret_key: e.target.value }))}
          placeholder={settings?.stripe_secret_key ?? 'sk_live_...'}
        />
        <p className="text-[11px] text-gray-400 mt-1">
          La encuentras en tu propio Dashboard de Stripe → Developers → API keys. Solo se guarda en el servidor,
          nunca se vuelve a mostrar completa.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Moneda</label>
        <select
          value={form.currency}
          onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
          className="w-full h-9 rounded-md border border-border bg-white px-3 text-sm uppercase focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>{c.toUpperCase()}</option>
          ))}
        </select>
      </div>

      <div className="border-t border-border pt-4">
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          1. Registra este webhook en tu Dashboard de Stripe
        </label>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={webhookUrl}
            className={`text-xs font-mono ${!webhookUrlReady ? 'border-red-300 text-red-600' : ''}`}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleCopy}
            disabled={!webhookUrlReady}
            className="shrink-0"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {webhookUrlReady ? (
          <p className="text-[11px] text-gray-400 mt-1">
            Developers → Webhooks → Add endpoint. Escucha el evento <code>checkout.session.completed</code>.
          </p>
        ) : (
          <p className="text-[11px] text-red-500 mt-1">
            No se pudo generar la URL del webhook. Recarga la página; si el problema persiste, contacta a soporte.
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          2. Pega aquí el Signing Secret que te da Stripe
        </label>
        <Input
          type="password"
          value={form.stripe_webhook_secret}
          onChange={(e) => setForm((f) => ({ ...f, stripe_webhook_secret: e.target.value }))}
          placeholder={settings?.stripe_webhook_secret ?? 'whsec_...'}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={update.isPending}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {update.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </div>
  );
}
