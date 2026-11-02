'use client';

import { useState, useMemo } from 'react';
import { Check, Plus, Mail, MessageSquare, Zap, Search } from 'lucide-react';
import { ORG_COMMUNICATION_EVENTS, PLATFORM_COMMUNICATION_EVENTS } from '@crm/shared';
import type { CommunicationTemplate } from '@crm/shared';
import { useSystemTemplates } from '@/hooks/useCommunications';
import { groupEvents, formatEventLabel } from './template-helpers';
import { EmailTemplateModal } from './EmailTemplateModal';
import { SmsTemplateModal } from './SmsTemplateModal';
import { Input } from '@/components/ui/input';

type ModalState = {
  channel: 'email' | 'sms';
  event: string;
  template?: CommunicationTemplate;
} | null;

type MatrixEntry = { email?: CommunicationTemplate; sms?: CommunicationTemplate };

export function EventTemplateMatrix() {
  const { data: systemTemplates = [], refetch } = useSystemTemplates();
  const [activeModal, setActiveModal] = useState<ModalState>(null);
  const [search, setSearch] = useState('');

  // Build lookup
  const matrix: Record<string, MatrixEntry> = {};
  for (const t of systemTemplates) {
    if (!matrix[t.event_type]) matrix[t.event_type] = {};
    if (t.channel_type === 'email') matrix[t.event_type].email = t;
    if (t.channel_type === 'sms') matrix[t.event_type].sms = t;
  }

  const allEvents = [...ORG_COMMUNICATION_EVENTS, ...PLATFORM_COMMUNICATION_EVENTS] as string[];
  const groups = groupEvents(allEvents);

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        events: g.events.filter((e) => formatEventLabel(e).toLowerCase().includes(q)),
      }))
      .filter((g) => g.events.length > 0);
  }, [groups, search]);

  // Stats
  const stats = useMemo(() => {
    const configuredEmail = allEvents.filter((e) => matrix[e]?.email).length;
    const configuredSms = allEvents.filter((e) => matrix[e]?.sms).length;
    const total = allEvents.length * 2;
    const configured = configuredEmail + configuredSms;
    return { total: allEvents.length, configuredEmail, configuredSms, coverage: total > 0 ? Math.round((configured / total) * 100) : 0 };
  }, [allEvents, matrix]);

  const handleChipClick = (event: string, channel: 'email' | 'sms', template?: CommunicationTemplate) => {
    setActiveModal({ channel, event, template });
  };

  return (
    <>
      {/* Stats bar */}
      <div className="flex items-center gap-6 mb-5">
        <div className="flex items-center gap-4">
          <StatPill icon={Zap} label="Eventos" value={stats.total} color="text-blue-600 bg-blue-50" />
          <StatPill icon={Mail} label="Email" value={stats.configuredEmail} suffix={`/${stats.total}`} color="text-emerald-600 bg-emerald-50" />
          <StatPill icon={MessageSquare} label="SMS" value={stats.configuredSms} suffix={`/${stats.total}`} color="text-emerald-600 bg-emerald-50" />
          <div className="h-5 w-px bg-border" />
          <span className={`text-xs font-semibold ${stats.coverage === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {stats.coverage}% cobertura
          </span>
        </div>
        <div className="flex-1" />
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar evento..."
            className="h-8 pl-9 text-[13px]"
          />
        </div>
      </div>

      {/* Event card grid */}
      <div className="space-y-6">
        {filteredGroups.map((group) => (
          <section key={group.label}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold">
                {group.label}
              </h2>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                {group.events.length}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {group.events.map((event) => {
                const entry = matrix[event] ?? {};
                return (
                  <EventCard
                    key={event}
                    event={event}
                    emailTemplate={entry.email}
                    smsTemplate={entry.sms}
                    onClickChannel={handleChipClick}
                  />
                );
              })}
            </div>
          </section>
        ))}

        {filteredGroups.length === 0 && (
          <div className="flex flex-col items-center py-12">
            <Search className="h-8 w-8 text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">Sin resultados para "{search}"</p>
          </div>
        )}
      </div>

      {activeModal?.channel === 'email' && (
        <EmailTemplateModal
          open
          onClose={() => setActiveModal(null)}
          template={activeModal.template}
          event={activeModal.event}
          eventGroups={groups}
          onSaved={() => refetch()}
        />
      )}

      {activeModal?.channel === 'sms' && (
        <SmsTemplateModal
          open
          onClose={() => setActiveModal(null)}
          template={activeModal.template}
          event={activeModal.event}
          eventGroups={groups}
          onSaved={() => refetch()}
        />
      )}
    </>
  );
}

/* ── Stat pill ──────────────────────────────────────────────────────────── */

function StatPill({
  icon: Icon,
  label,
  value,
  suffix,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  suffix?: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-6 h-6 rounded-md flex items-center justify-center ${color}`}>
        <Icon className="w-3 h-3" />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-bold text-gray-900">{value}</span>
        {suffix && <span className="text-[11px] text-gray-400">{suffix}</span>}
        <span className="text-[11px] text-gray-400">{label}</span>
      </div>
    </div>
  );
}

/* ── Event card ─────────────────────────────────────────────────────────── */

function EventCard({
  event,
  emailTemplate,
  smsTemplate,
  onClickChannel,
}: {
  event: string;
  emailTemplate?: CommunicationTemplate;
  smsTemplate?: CommunicationTemplate;
  onClickChannel: (event: string, channel: 'email' | 'sms', template?: CommunicationTemplate) => void;
}) {
  const isFullyConfigured = !!emailTemplate && !!smsTemplate;
  const isPartial = (!!emailTemplate || !!smsTemplate) && !isFullyConfigured;

  return (
    <div className={`
      bg-panel border rounded-xl p-4 transition-all
      ${isFullyConfigured
        ? 'border-emerald-200 bg-emerald-50/20'
        : isPartial
          ? 'border-amber-200 bg-amber-50/10'
          : 'border-border hover:border-gray-300'}
    `}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-medium text-gray-900 truncate">
            {formatEventLabel(event)}
          </h3>
        </div>
        {isFullyConfigured && (
          <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 ml-2">
            <Check className="w-3 h-3 text-emerald-600" />
          </div>
        )}
      </div>

      {/* Channel buttons */}
      <div className="flex gap-2">
        <ChannelButton
          icon={Mail}
          label="Email"
          configured={!!emailTemplate}
          onClick={() => onClickChannel(event, 'email', emailTemplate)}
        />
        <ChannelButton
          icon={MessageSquare}
          label="SMS"
          configured={!!smsTemplate}
          onClick={() => onClickChannel(event, 'sms', smsTemplate)}
        />
      </div>
    </div>
  );
}

/* ── Channel button inside card ──────────────────────────────────────── */

function ChannelButton({
  icon: Icon,
  label,
  configured,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  configured: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all
        ${configured
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
          : 'bg-gray-50 text-gray-400 border border-dashed border-gray-300 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300'}
      `}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
      {configured ? (
        <Check className="w-3 h-3 ml-auto" />
      ) : (
        <Plus className="w-3 h-3 ml-auto" />
      )}
    </button>
  );
}
