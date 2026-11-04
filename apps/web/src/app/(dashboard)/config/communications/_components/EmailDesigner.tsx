'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Monitor, Smartphone, Mail, MessageSquare, Palette } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMyOrganization, useUpdateBranding, useUpdateNotificationPreferences } from '@/hooks/useOrganizations';
import { toast } from '@/hooks/useToast';
import type { OrganizationBranding, NotificationPreferences } from '@crm/shared';
import { APPOINTMENT_REMINDER_TEMPLATE, renderTemplate, type TemplateVars } from './template-engine';
import { NotificationToggles } from './NotificationToggles';
import { SmsPreview } from './SmsPreview';

const DEFAULT_SMS_TEMPLATE = `Hola {{contact_name}}, te recordamos tu cita "{{title}}" el {{date}} a las {{time}}.{{#if location}} Lugar: {{location}}.{{/if}}{{#if meeting_url}} Link: {{meeting_url}}{{/if}} — {{organization_name}}`;

const SMS_VARIABLES = [
  '{{contact_name}}',
  '{{title}}',
  '{{date}}',
  '{{time}}',
  '{{location}}',
  '{{meeting_url}}',
  '{{organization_name}}',
];

type Channel = 'email' | 'sms';
type ViewMode = 'desktop' | 'mobile';

export function EmailDesigner() {
  const { data: org } = useMyOrganization();
  const updateBranding = useUpdateBranding();
  const updateNotifPrefs = useUpdateNotificationPreferences();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const smsTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [channel, setChannel] = useState<Channel>('email');
  const [viewMode, setViewMode] = useState<ViewMode>('desktop');

  const [brand, setBrand] = useState<Partial<OrganizationBranding>>({});
  const [prefs, setPrefs] = useState<NotificationPreferences>({});
  const [smsTemplate, setSmsTemplate] = useState(DEFAULT_SMS_TEMPLATE);

  const [sample, setSample] = useState({
    contact_name: 'María García',
    title: 'Revisión de propuesta',
    date: 'Jueves 10 julio',
    time: '10:00 AM',
    location: 'Google Meet',
    meeting_url: 'https://meet.google.com/abc-defg-hij',
  });

  useEffect(() => {
    if (org?.settings?.branding) setBrand(org.settings.branding);
    if (org?.settings?.notification_preferences) setPrefs(org.settings.notification_preferences);
  }, [org]);

  const vars: TemplateVars = useMemo(() => ({
    organization_name: org?.name ?? 'Mi Empresa',
    logo_url: brand.logo_url ?? '',
    primary_color: brand.primary_color ?? '#2563EB',
    accent_color: brand.accent_color ?? '#10B981',
    from_name: brand.from_name ?? org?.name ?? 'Mi Empresa',
    support_email: brand.support_email ?? '',
    website_url: brand.website_url ?? '',
    contact_name: sample.contact_name,
    title: sample.title,
    date: sample.date,
    time: sample.time,
    end_time: '10:45 AM',
    timezone: 'CST',
    location: sample.location,
    meeting_url: sample.meeting_url,
  }), [org, brand, sample]);

  const renderedHtml = useMemo(() => renderTemplate(APPOINTMENT_REMINDER_TEMPLATE, vars), [vars]);

  const renderedSms = useMemo(() => {
    let text = smsTemplate;
    text = text.replace(
      /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_, key, block) => vars[key as keyof TemplateVars] ? block : '',
    );
    for (const [key, value] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
    }
    return text;
  }, [smsTemplate, vars]);

  useEffect(() => {
    if (channel !== 'email') return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(renderedHtml);
    doc.close();
  }, [renderedHtml, channel]);

  const handleSaveBranding = async () => {
    try {
      await updateBranding.mutateAsync(brand);
      toast({ title: 'Brand saved' });
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'error' });
    }
  };

  const handleSaveNotifs = async () => {
    try {
      await updateNotifPrefs.mutateAsync(prefs);
      toast({ title: 'Preferences saved' });
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'error' });
    }
  };

  const handleToggleNotif = (key: string) => {
    setPrefs((p) => ({
      ...p,
      [key]: { enabled: p[key]?.enabled === false },
    }));
  };

  const insertSmsVariable = (variable: string) => {
    const textarea = smsTextareaRef.current;
    if (!textarea) {
      setSmsTemplate((prev) => prev + variable);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = smsTemplate.substring(0, start) + variable + smsTemplate.substring(end);
    setSmsTemplate(newText);
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + variable.length;
      textarea.setSelectionRange(pos, pos);
    });
  };

  const smsCharCount = renderedSms.length;
  const smsSegments = Math.ceil(smsCharCount / 160) || 1;

  return (
    <div className="space-y-5">
      {/* ── Brand bar (horizontal) ─────────────────────────────────────── */}
      <div className="rounded-xl border border-subtle bg-surface p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-olive-dark flex items-center justify-center">
            <Palette className="w-3.5 h-3.5 text-accent" />
          </div>
          <h3 className="text-sm font-semibold text-primary">Brand identity</h3>
        </div>

        {channel === 'email' && (
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="w-28">
              <label className="block text-[11px] font-medium text-secondary mb-1.5">Primary</label>
              <div className="flex items-center gap-2 h-8 px-2.5 rounded-lg border border-subtle bg-surface-raised/50">
                <input
                  type="color"
                  value={brand.primary_color ?? '#2563EB'}
                  onChange={(e) => setBrand((b) => ({ ...b, primary_color: e.target.value }))}
                  className="w-4 h-4 rounded-sm cursor-pointer border-0 bg-transparent p-0"
                />
                <span className="text-[11px] font-mono text-secondary">{brand.primary_color ?? '#2563EB'}</span>
              </div>
            </div>
            <div className="w-28">
              <label className="block text-[11px] font-medium text-secondary mb-1.5">Accent</label>
              <div className="flex items-center gap-2 h-8 px-2.5 rounded-lg border border-subtle bg-surface-raised/50">
                <input
                  type="color"
                  value={brand.accent_color ?? '#10B981'}
                  onChange={(e) => setBrand((b) => ({ ...b, accent_color: e.target.value }))}
                  className="w-4 h-4 rounded-sm cursor-pointer border-0 bg-transparent p-0"
                />
                <span className="text-[11px] font-mono text-secondary">{brand.accent_color ?? '#10B981'}</span>
              </div>
            </div>
            <MiniField
              label="Sender"
              value={brand.from_name ?? ''}
              onChange={(v) => setBrand((b) => ({ ...b, from_name: v }))}
              placeholder="Your company"
            />
            <MiniField
              label="Email"
              value={brand.from_email ?? ''}
              onChange={(v) => setBrand((b) => ({ ...b, from_email: v }))}
              placeholder="hola@tudominio.com"
            />
            <MiniField
              label="Logo URL"
              value={brand.logo_url ?? ''}
              onChange={(v) => setBrand((b) => ({ ...b, logo_url: v }))}
              placeholder="https://..."
            />
            <MiniField
              label="Website"
              value={brand.website_url ?? ''}
              onChange={(v) => setBrand((b) => ({ ...b, website_url: v }))}
              placeholder="https://tuempresa.com"
            />
            <MiniField
              label="Support"
              value={brand.support_email ?? ''}
              onChange={(v) => setBrand((b) => ({ ...b, support_email: v }))}
              placeholder="soporte@..."
            />
            <Button
              size="sm"
              onClick={handleSaveBranding}
              disabled={updateBranding.isPending}
              className="h-8 bg-accent hover:bg-accent-hover text-on-accent text-xs shrink-0"
            >
              {updateBranding.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}

        {channel === 'sms' && (
          <div className="flex items-end gap-3">
            <MiniField
              label="Sender"
              value={brand.from_name ?? ''}
              onChange={(v) => setBrand((b) => ({ ...b, from_name: v }))}
              placeholder="Your company"
            />
            <Button
              size="sm"
              onClick={handleSaveBranding}
              disabled={updateBranding.isPending}
              className="h-8 bg-accent hover:bg-accent-hover text-on-accent text-xs shrink-0"
            >
              {updateBranding.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </div>

      {/* ── 3-column layout (independent components) ──────────────────── */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        {/* LEFT: Sample data */}
        <div className="w-full xl:w-[240px] shrink-0 rounded-xl border border-subtle bg-surface p-4">
          <h3 className="text-[13px] font-semibold text-primary mb-3">Test content</h3>
          <div className="space-y-2.5">
            <SmallField label="Contact" value={sample.contact_name} onChange={(v) => setSample((s) => ({ ...s, contact_name: v }))} />
            <SmallField label="Appointment title" value={sample.title} onChange={(v) => setSample((s) => ({ ...s, title: v }))} />
            <div className="grid grid-cols-2 gap-2">
              <SmallField label="Date" value={sample.date} onChange={(v) => setSample((s) => ({ ...s, date: v }))} />
              <SmallField label="Time" value={sample.time} onChange={(v) => setSample((s) => ({ ...s, time: v }))} />
            </div>
            <SmallField label="Location" value={sample.location} onChange={(v) => setSample((s) => ({ ...s, location: v }))} />
            <SmallField label="Meeting link" value={sample.meeting_url} onChange={(v) => setSample((s) => ({ ...s, meeting_url: v }))} placeholder="https://..." />
          </div>
        </div>

        {/* CENTER: Preview */}
        <div className="flex-1 min-w-0 rounded-xl border border-subtle bg-surface overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 px-4 border-b border-subtle">
            <div className="flex items-center gap-0.5 bg-surface-raised rounded-lg p-0.5">
              <ToggleBtn active={channel === 'email'} onClick={() => setChannel('email')} icon={Mail} label="Email" />
              <ToggleBtn active={channel === 'sms'} onClick={() => setChannel('sms')} icon={MessageSquare} label="SMS" />
            </div>

            {channel === 'email' && (
              <div className="flex items-center gap-0.5 bg-surface-raised rounded-lg p-0.5">
                <ToggleBtn active={viewMode === 'desktop'} onClick={() => setViewMode('desktop')} icon={Monitor} label="Desktop" />
                <ToggleBtn active={viewMode === 'mobile'} onClick={() => setViewMode('mobile')} icon={Smartphone} label="Mobile" />
              </div>
            )}

            {channel === 'sms' && (
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono ${smsCharCount > 160 ? 'text-warning' : 'text-secondary'}`}>
                  {smsCharCount} chars
                </span>
                <span className="text-[10px] text-muted bg-surface-raised px-2 py-0.5 rounded-full">
                  {smsSegments} {smsSegments === 1 ? 'seg' : 'segs'}
                </span>
              </div>
            )}
          </div>

          {/* Preview area */}
          <div className="bg-app/60">
            {channel === 'email' ? (
              <div className="flex justify-center p-6">
                <div
                  className="transition-all duration-300 ease-in-out"
                  style={{
                    width: viewMode === 'desktop' ? '100%' : '390px',
                    maxWidth: viewMode === 'desktop' ? '680px' : '390px',
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    title="Email preview"
                    className="w-full rounded-xl shadow-lg"
                    sandbox="allow-same-origin"
                    style={{ border: 'none', minHeight: '650px' }}
                  />
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {/* SMS editor */}
                <div>
                  <Textarea
                    ref={smsTextareaRef}
                    value={smsTemplate}
                    onChange={(e) => setSmsTemplate(e.target.value)}
                    rows={4} className="resize-none text-[13px]"
                    placeholder="Write your SMS message..."
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {SMS_VARIABLES.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertSmsVariable(v)}
                        className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-olive-dark text-accent border border-accent/20 hover:bg-accent/15 transition-colors"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                {/* SMS preview */}
                <div className="flex justify-center py-2">
                  <SmsPreview message={renderedSms} orgName={vars.organization_name} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Notification toggles */}
        <div className="w-full xl:w-[240px] shrink-0 rounded-xl border border-subtle bg-surface p-4">
          <NotificationToggles
            prefs={prefs}
            onToggle={handleToggleNotif}
            onSave={handleSaveNotifs}
            saving={updateNotifPrefs.isPending}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Small helpers ───────────────────────────────────────────────────── */

function ToggleBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
        active ? 'bg-surface text-primary shadow-xs' : 'text-secondary hover:text-primary'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function MiniField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex-1 min-w-[140px]">
      <label className="block text-[11px] font-medium text-secondary mb-1.5">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-[12px]"
      />
    </div>
  );
}

function SmallField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-secondary mb-1">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 text-[12px]"
      />
    </div>
  );
}
