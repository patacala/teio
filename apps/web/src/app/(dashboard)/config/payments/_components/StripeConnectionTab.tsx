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
      toast({ title: 'Stripe settings saved', variant: 'default' });
    } catch {
      toast({ title: 'Error saving the settings', variant: 'error' });
    }
  };

  if (isLoading) {
    return <div className="h-64 rounded-xl border border-subtle animate-pulse bg-surface max-w-xl" />;
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
          settings?.is_connected ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
        }`}
      >
        {settings?.is_connected ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
        {settings?.is_connected ? 'Stripe connected' : 'Stripe not configured yet'}
      </div>

      <div>
        <label className="block text-xs font-medium text-primary mb-1.5">Stripe Secret Key</label>
        <Input
          type="password"
          value={form.stripe_secret_key}
          onChange={(e) => setForm((f) => ({ ...f, stripe_secret_key: e.target.value }))}
          placeholder={settings?.stripe_secret_key ?? 'sk_live_...'}
        />
        <p className="text-[11px] text-muted mt-1">
          You&apos;ll find it in your own Stripe Dashboard → Developers → API keys. It&apos;s only stored on the server and is never shown in full again.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-primary mb-1.5">Currency</label>
        <select
          value={form.currency}
          onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
          className="w-full h-9 rounded-md border border-subtle bg-surface-raised px-3 text-sm uppercase focus:outline-hidden focus:ring-1 focus:ring-accent/40"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>{c.toUpperCase()}</option>
          ))}
        </select>
      </div>

      <div className="border-t border-subtle pt-4">
        <label className="block text-xs font-medium text-primary mb-1.5">
          1. Register this webhook in your Stripe Dashboard
        </label>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={webhookUrl}
            className={`text-xs font-mono ${!webhookUrlReady ? 'border-danger/25 text-danger' : ''}`}
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
          <p className="text-[11px] text-muted mt-1">
            Developers → Webhooks → Add endpoint. Listen for the event <code>checkout.session.completed</code>.
          </p>
        ) : (
          <p className="text-[11px] text-danger mt-1">
            Could not generate the webhook URL. Reload the page; if the problem persists, contact support.
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-primary mb-1.5">
          2. Paste the Signing Secret Stripe gives you here
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
          className="bg-accent hover:bg-accent-hover text-on-accent"
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
