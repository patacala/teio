'use client';

import { useContact } from '@/hooks/useContacts';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { getInitials, formatRelativeTime } from '@/lib/utils';
import {
  Mail, Phone, Bot, Clock, Tag, TrendingUp,
  MessageSquare, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContactProfilePanelProps {
  contactId: string | null;
}

function Section({ title, icon, children }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="text-gray-400">{icon}</span>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          {title}
        </p>
      </div>
      {children}
    </div>
  );
}

export function ContactProfilePanel({ contactId }: ContactProfilePanelProps) {
  const { data: contact, isLoading } = useContact(contactId);

  if (!contactId) {
    return (
      <div className="w-[320px] shrink-0 hidden lg:flex flex-col items-center justify-center border-l border-border bg-gray-50/50">
        <div className="text-center px-6">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <MessageSquare className="h-5 w-5 text-gray-300" />
          </div>
          <p className="text-xs font-medium text-gray-400">
            Select a conversation
          </p>
          <p className="text-[11px] text-gray-300 mt-1">
            to view contact details
          </p>
        </div>
      </div>
    );
  }

  const fullName = contact
    ? `${contact.first_name} ${contact.last_name}`.trim()
    : '…';

  return (
    <div className="w-[320px] shrink-0 hidden lg:flex flex-col border-l border-border bg-white overflow-y-auto">
      {/* Avatar + name */}
      <div className="px-4 py-5 border-b border-gray-100">
        {isLoading ? (
          <div className="space-y-3 text-center">
            <Skeleton className="h-14 w-14 rounded-full mx-auto" />
            <Skeleton className="h-4 w-32 mx-auto" />
            <Skeleton className="h-3 w-24 mx-auto" />
          </div>
        ) : (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-lg font-bold mx-auto mb-2.5">
              {getInitials(fullName)}
            </div>
            <p className="font-semibold text-gray-900 text-sm">{fullName}</p>

            <div className="mt-3 space-y-1.5">
              {contact?.email && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span className="truncate">{contact.email}</span>
                </div>
              )}
              {contact?.phone && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span>{contact.phone}</span>
                </div>
              )}
              {contact?.last_activity && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Last seen {formatRelativeTime(contact.last_activity)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lead Score */}
      {contact?.lead_score !== undefined && (
        <Section title="Lead Score" icon={<TrendingUp className="h-3.5 w-3.5" />}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">Score</span>
            <span className={cn(
              'text-sm font-bold',
              contact.lead_score >= 70 ? 'text-emerald-600' :
              contact.lead_score >= 40 ? 'text-amber-600' :
              'text-gray-500',
            )}>
              {contact.lead_score}
            </span>
          </div>
          <Progress value={contact.lead_score} className="h-1.5" />
          <p className="text-[10px] text-gray-400 mt-1">
            {contact.lead_score >= 70 ? 'Hot lead' : contact.lead_score >= 40 ? 'Warm lead' : 'Cold lead'}
          </p>
        </Section>
      )}

      {/* Tags */}
      {contact?.tags && contact.tags.length > 0 && (
        <Section title="Tags" icon={<Tag className="h-3.5 w-3.5" />}>
          <div className="flex flex-wrap gap-1">
            {contact.tags.map((tag) => (
              <Badge key={tag} variant="default" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {/* AI Insights */}
      {contact?.ai_insights && (
        <Section title="AI Insights" icon={<Bot className="h-3.5 w-3.5 text-gray-400" />}>
          <div className="space-y-2">
            {contact.ai_insights.intent && (
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] text-gray-400">Intent</span>
                <span className="text-[11px] font-medium text-gray-700 capitalize text-right">
                  {contact.ai_insights.intent}
                </span>
              </div>
            )}
            {contact.ai_insights.sentiment && (
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] text-gray-400">Sentiment</span>
                <span className={cn(
                  'text-[11px] font-medium capitalize',
                  contact.ai_insights.sentiment === 'positive' ? 'text-emerald-600' :
                  contact.ai_insights.sentiment === 'negative' ? 'text-rose-500' :
                  'text-gray-500',
                )}>
                  {contact.ai_insights.sentiment}
                </span>
              </div>
            )}
            {contact.ai_insights.summary && (
              <div className="mt-2 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <div className="flex items-center gap-1 mb-1">
                  <Sparkles className="h-3 w-3 text-gray-400" />
                  <span className="text-[10px] font-semibold text-gray-500">Summary</span>
                </div>
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  {contact.ai_insights.summary}
                </p>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Skeleton sections when loading */}
      {isLoading && (
        <>
          <Section title="Lead Score" icon={<TrendingUp className="h-3.5 w-3.5" />}>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </Section>
          <Section title="Tags" icon={<Tag className="h-3.5 w-3.5" />}>
            <div className="flex gap-1">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </Section>
          <Section title="AI Insights" icon={<Bot className="h-3.5 w-3.5" />}>
            <Skeleton className="h-16 w-full rounded-lg" />
          </Section>
        </>
      )}
    </div>
  );
}
