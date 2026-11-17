'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useContact, useOptOut } from '@/hooks/useContacts';
import { useConversation, useCreateConversation } from '@/hooks/useConversations';
import { usePayments } from '@/hooks/usePayments';
import { toast } from '@/hooks/useToast';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChannelBadge } from './channel-badge';
import { LeadStageSelector } from './lead-stage-selector';
import { LeadScoreIndicator } from './lead-score-indicator';
import { AgentStatusToggle } from './agent-status-toggle';
import { ContactTags } from './contact-tags';
import { CapturedFieldsList } from './captured-fields-list';
import { reachableChannels } from '@/components/lead/reachable-channels';
import { getInitials, formatRelativeTime, formatMoney } from '@/lib/utils';
import type { Payment } from '@/services/payments.service';
import {
  Mail, Phone, Bot, Clock, Tag, TrendingUp,
  MessageSquare, Sparkles, Layers, Wallet, BellOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const PAYMENT_STATUS_VARIANT: Record<Payment['status'], 'success' | 'warn' | 'default' | 'destructive'> = {
  paid: 'success',
  pending: 'warn',
  expired: 'default',
  canceled: 'default',
  failed: 'destructive',
  refunded: 'default',
};

interface ContactSidebarProps {
  contactId: string | null;
  conversationId: string | null;
}

function Section({ title, icon, children }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3 border-b border-subtle">
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="text-muted">{icon}</span>
        <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
          {title}
        </p>
      </div>
      {children}
    </div>
  );
}

export function ContactSidebar({ contactId, conversationId }: ContactSidebarProps) {
  const router = useRouter();
  const { data: contact, isLoading } = useContact(contactId);
  const { data: conversation } = useConversation(conversationId);
  const { data: payments, isLoading: paymentsLoading } = usePayments(contactId ?? undefined, { enabled: !!contactId });
  const createConversation = useCreateConversation();
  const optOut = useOptOut();
  const [startChannel, setStartChannel] = useState<string | undefined>(undefined);

  const handleStartConversation = async () => {
    if (!contactId || !startChannel) return;
    const conv = await createConversation.mutateAsync({ contact_id: contactId, channel: startChannel });
    router.replace(`/inbox?conversationId=${conv.id}`, { scroll: false });
  };

  const handleOptOut = async () => {
    if (!contactId) return;
    try {
      const { sequences_cancelled } = await optOut.mutateAsync(contactId);
      toast({
        title: sequences_cancelled > 0
          ? `Opted out. ${sequences_cancelled} follow-up sequence(s) cancelled.`
          : 'Opted out of automated follow-ups.',
      });
    } catch (err) {
      toast({ title: (err as Error)?.message || 'Failed to opt out', variant: 'error' });
    }
  };

  if (!contactId) {
    return (
      <div className="w-[320px] shrink-0 hidden lg:flex flex-col items-center justify-center border-l border-subtle bg-surface-raised/50">
        <div className="text-center px-6">
          <div className="w-12 h-12 rounded-2xl bg-surface-raised flex items-center justify-center mx-auto mb-3">
            <MessageSquare className="h-5 w-5 text-muted" />
          </div>
          <p className="text-xs font-medium text-muted">Select a conversation</p>
          <p className="text-[11px] text-muted mt-1">to view contact details</p>
        </div>
      </div>
    );
  }

  const fullName = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Anonymous'
    : '…';

  return (
    <div className="w-[320px] shrink-0 hidden lg:flex flex-col border-l border-subtle bg-surface overflow-y-auto">
      {/* Profile header */}
      <div className="px-4 py-5 border-b border-subtle">
        {isLoading ? (
          <div className="space-y-3 text-center">
            <Skeleton className="h-14 w-14 rounded-full mx-auto" />
            <Skeleton className="h-4 w-32 mx-auto" />
            <Skeleton className="h-3 w-24 mx-auto" />
          </div>
        ) : (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-olive-dark text-accent flex items-center justify-center text-lg font-bold mx-auto mb-2.5">
              {getInitials(fullName)}
            </div>
            <p className="font-semibold text-primary text-sm">{fullName}</p>
            <div className="mt-3 space-y-1.5">
              {contact?.email && (
                <div className="flex items-center gap-2 text-xs text-secondary">
                  <Mail className="h-3.5 w-3.5 text-muted shrink-0" />
                  <span className="truncate">{contact.email}</span>
                </div>
              )}
              {contact?.phone && (
                <div className="flex items-center gap-2 text-xs text-secondary">
                  <Phone className="h-3.5 w-3.5 text-muted shrink-0" />
                  <span>{contact.phone}</span>
                </div>
              )}
              {contact?.last_activity && (
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Last seen {formatRelativeTime(contact.last_activity)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lead Stage */}
      {contactId && (
        <Section title="Lead Stage" icon={<Layers className="h-3.5 w-3.5" />}>
          <LeadStageSelector contactId={contactId} currentStage={contact?.lead_stage} />
        </Section>
      )}

      {/* Lead Score */}
      {(contact?.lead_score !== undefined || isLoading) && (
        <Section title="Lead Score" icon={<TrendingUp className="h-3.5 w-3.5" />}>
          {isLoading ? (
            <Skeleton className="h-1.5 w-full rounded-full" />
          ) : (
            <LeadScoreIndicator score={contact?.lead_score} />
          )}
        </Section>
      )}

      {/* Channel opt-out */}
      {!isLoading && contact && (
        <Section title="Communications" icon={<BellOff className="h-3.5 w-3.5" />}>
          {contact.tags?.includes('opt-out') ? (
            <Badge variant="warn">Opted out of automated follow-ups</Badge>
          ) : (
            <Button variant="outline" size="sm" onClick={handleOptOut} disabled={optOut.isPending}>
              {optOut.isPending ? 'Opting out…' : 'Opt out of follow-ups'}
            </Button>
          )}
        </Section>
      )}

      {/* Bot / Human toggle */}
      {conversationId && (
        <Section title="Assigned To" icon={<Bot className="h-3.5 w-3.5" />}>
          <AgentStatusToggle
            conversationId={conversationId}
            botActive={conversation?.bot_active ?? true}
          />
        </Section>
      )}

      {/* Start a conversation — only once we know the lead's reachable channels */}
      {!conversationId && !isLoading && contact && (
        <Section title="Start Conversation" icon={<MessageSquare className="h-3.5 w-3.5" />}>
          {(() => {
            const channels = reachableChannels(contact);
            if (channels.length === 0) {
              return <p className="text-[11px] text-muted">No reachable channel on file for this lead.</p>;
            }
            return (
              <div className="flex items-center gap-2">
                <Select value={startChannel} onValueChange={setStartChannel}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue placeholder="Choose a channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((c) => (
                      <SelectItem key={c} value={c}>
                        <ChannelBadge channel={c} showLabel />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!startChannel || createConversation.isPending}
                  onClick={handleStartConversation}
                >
                  {createConversation.isPending ? 'Starting…' : 'Start'}
                </Button>
              </div>
            );
          })()}
        </Section>
      )}

      {/* Payments */}
      {(paymentsLoading || (payments && payments.length > 0)) && (
        <Section title="Payments" icon={<Wallet className="h-3.5 w-3.5" />}>
          {paymentsLoading ? (
            <Skeleton className="h-10 w-full rounded-lg" />
          ) : (
            <div className="space-y-1.5">
              {payments!.slice(0, 3).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate text-secondary">{p.service?.name ?? 'Payment'}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="font-medium text-primary">{formatMoney(p.amount, p.currency)}</span>
                    <Badge variant={PAYMENT_STATUS_VARIANT[p.status]}>{p.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Tags */}
      <Section title="Tags" icon={<Tag className="h-3.5 w-3.5" />}>
        {isLoading ? (
          <div className="flex gap-1">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ) : (
          <ContactTags contactId={contactId} tags={contact?.tags ?? []} />
        )}
      </Section>

      {/* Captured Fields */}
      <Section title="Captured Fields" icon={<MessageSquare className="h-3.5 w-3.5" />}>
        <CapturedFieldsList contactId={contactId} />
      </Section>

      {/* AI Insights */}
      {(contact?.ai_insights || isLoading) && (
        <Section title="AI Insights" icon={<Bot className="h-3.5 w-3.5 text-muted" />}>
          {isLoading ? (
            <Skeleton className="h-16 w-full rounded-lg" />
          ) : (
            <div className="space-y-2">
              {contact?.ai_insights?.intent && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-muted">Intent</span>
                  <span className="text-[11px] font-medium text-primary capitalize text-right">
                    {contact.ai_insights.intent}
                  </span>
                </div>
              )}
              {contact?.ai_insights?.sentiment && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-muted">Sentiment</span>
                  <span className={cn(
                    'text-[11px] font-medium capitalize',
                    contact.ai_insights.sentiment === 'positive' ? 'text-success' :
                    contact.ai_insights.sentiment === 'negative' ? 'text-danger' :
                    'text-secondary',
                  )}>
                    {contact.ai_insights.sentiment}
                  </span>
                </div>
              )}
              {contact?.ai_insights?.summary && (
                <div className="mt-2 p-2.5 rounded-lg bg-surface-raised border border-subtle">
                  <div className="flex items-center gap-1 mb-1">
                    <Sparkles className="h-3 w-3 text-muted" />
                    <span className="text-[10px] font-semibold text-secondary">Summary</span>
                  </div>
                  <p className="text-[11px] text-secondary leading-relaxed">
                    {contact.ai_insights.summary}
                  </p>
                </div>
              )}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
