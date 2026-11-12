'use client';

import { useRouter } from 'next/navigation';
import {
  BarChart3, Phone, Copy, Clock, Flame,
  Sparkles, Target, Smile, Zap, List,
  MessageCircle, Mail, ChevronRight, Tag as TagIcon,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { toast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import type { Contact } from '@/services/contacts.service';
import { voiceService } from '@/services/voice.service';
import {
  isHot, visibleCustomFields, fieldIcon, fieldLabel, prettifySentiment,
  waLink, relativeTime, initialsOf, recommendedAction, lastActivity,
} from './contactCardHelpers';

interface Props {
  contact: Contact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels?: Record<string, string>;
}

function SectionTitle({ icon: Icon, accent, children }: { icon: typeof List; accent: string; children: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className={cn('h-4 w-4', accent)} />
      <h3 className="text-xs font-semibold text-primary uppercase tracking-wide">{children}</h3>
    </div>
  );
}

export function ContactQuickView({ contact, open, onOpenChange, labels }: Props) {
  const router = useRouter();
  const hot = isHot(contact);
  const score = contact.lead_score ?? 0;
  const name = `${contact.first_name} ${contact.last_name ?? ''}`.trim();
  const fields = visibleCustomFields(contact);
  const tags = contact.tags ?? [];
  const wa = waLink(contact.phone);
  const action = recommendedAction(contact);
  const activity = lastActivity(contact);

  const copyPhone = () => {
    if (!contact.phone) return;
    navigator.clipboard.writeText(contact.phone);
    toast({ title: 'Phone copied' });
  };

  const handleCall = async () => {
    if (!contact.phone) return;
    try {
      await voiceService.startCall({ contact_id: contact.id });
      toast({ title: 'Call started', description: 'The agent is calling the contact.' });
    } catch {
      toast({ title: 'Could not start the call', variant: 'error' });
    }
  };

  const accent = hot ? 'text-warning' : 'text-accent';
  const tint = hot ? 'bg-warning/10' : 'bg-olive-dark';
  const actionLink = buttonVariants({ variant: 'outline', size: 'lg' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogTitle className="sr-only">{name}</DialogTitle>

        <div className={cn('px-7 pt-7 pb-5 border-b border-subtle', hot ? 'bg-warning/8' : 'bg-surface-raised')}>
          <div className="flex items-start justify-between gap-4 pr-6">
            <div className="flex items-center gap-4 min-w-0">
              <div className="relative shrink-0">
                <div
                  className={cn(
                    'w-20 h-20 rounded-full border-2 flex items-center justify-center text-2xl font-bold',
                    hot ? 'border-warning/40 text-warning' : 'border-accent/20 bg-olive-dark text-accent',
                  )}
                >
                  {initialsOf(contact)}
                </div>
                <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full border border-subtle bg-surface flex items-center justify-center">
                  {hot
                    ? <Flame className="h-4 w-4 text-warning" fill="currentColor" />
                    : <BarChart3 className="h-4 w-4 text-secondary" />}
                </div>
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-primary leading-tight truncate">{name}</h2>
                {contact.phone && (
                  <button
                    type="button"
                    onClick={copyPhone}
                    aria-label={`Copy phone ${contact.phone}`}
                    className="flex items-center gap-2 text-secondary hover:text-primary mt-1 text-sm rounded-md outline-hidden focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <Phone className="h-4 w-4" />
                    {contact.phone}
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="text-right shrink-0">
              <p className="text-4xl font-bold text-primary leading-none">
                {score}
                <span className="text-lg font-semibold text-muted">/100</span>
              </p>
              <p className="text-xs text-muted mt-1">Lead score</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-5">
            <Badge variant={hot ? 'warning' : 'neutral'} className="gap-1.5 px-3 py-1 text-xs">
              {hot ? <Flame className="h-3.5 w-3.5" fill="currentColor" /> : <BarChart3 className="h-3.5 w-3.5" />}
              {hot ? 'HOT' : 'NORMAL'}
            </Badge>
            {activity && (
              <Badge variant="neutral" className="gap-1.5 px-3 py-1 text-xs normal-case">
                <Clock className="h-3.5 w-3.5" />
                Active {relativeTime(activity)}
              </Badge>
            )}
          </div>
        </div>

        <div className="p-7 grid grid-cols-1 md:grid-cols-2 gap-x-10">
          <div>
            <SectionTitle icon={Sparkles} accent={accent}>AI summary</SectionTitle>
            {contact.ai_insights?.summary ? (
              <p className="text-sm text-primary leading-relaxed">{contact.ai_insights.summary}</p>
            ) : (
              <p className="text-sm text-muted">No summary yet.</p>
            )}

            {(contact.ai_insights?.intent || contact.ai_insights?.sentiment) && (
              <div className={cn(tint, 'rounded-xl px-4 py-3 mt-4 space-y-1.5')}>
                {contact.ai_insights?.intent && (
                  <div className="flex items-center gap-2 text-sm">
                    <Target className={cn('h-4 w-4 shrink-0', accent)} />
                    <span className="text-secondary">Intent:</span>
                    <span className="font-semibold text-primary">{contact.ai_insights.intent}</span>
                  </div>
                )}
                {contact.ai_insights?.sentiment && (
                  <div className="flex items-center gap-2 text-sm">
                    <Smile className={cn('h-4 w-4 shrink-0', accent)} />
                    <span className="text-secondary">Sentiment:</span>
                    <span className={cn('font-semibold', accent)}>{prettifySentiment(contact.ai_insights.sentiment)}</span>
                  </div>
                )}
              </div>
            )}

            {action && (
              <div className="border-t border-subtle mt-5 pt-5">
                <SectionTitle icon={Zap} accent={accent}>Recommended next action</SectionTitle>
                <div className={cn(tint, 'rounded-xl px-4 py-3')}>
                  <p className={cn('font-semibold', accent)}>{action.title}</p>
                  <p className="text-xs text-secondary mt-0.5">{action.description}</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 md:mt-0">
            <SectionTitle icon={List} accent={accent}>Collected data</SectionTitle>
            {fields.length === 0 ? (
              <p className="text-sm text-muted">No captured data yet.</p>
            ) : (
              <div className="divide-y divide-subtle">
                {fields.map(([key, value]) => {
                  const Icon = fieldIcon(key);
                  // Long free-text answers get their own line under the label.
                  const long = value.length > 28;
                  return (
                    <div key={key} className="py-2.5">
                      <div className={cn('flex items-center gap-3', !long && 'justify-between')}>
                        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
                          <Icon className={cn('h-4 w-4 shrink-0', accent)} />
                          <span className="text-sm text-secondary truncate">{fieldLabel(key, labels)}</span>
                        </div>
                        {!long && <span className="text-sm font-semibold text-primary text-right truncate">{value}</span>}
                      </div>
                      {long && (
                        <p className="text-sm font-semibold text-primary mt-1 pl-6.5 leading-snug wrap-break-word">{value}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {tags.length > 0 && (
              <>
                <div className="mt-6">
                  <SectionTitle icon={TagIcon} accent={accent}>Tags</SectionTitle>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant={hot ? 'warning' : 'secondary'} className="normal-case">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="px-7 pb-7 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Button size="lg" onClick={handleCall} disabled={!contact.phone}>
            <Phone className="h-4 w-4" /> Call
          </Button>
          {wa ? (
            <a href={wa} target="_blank" rel="noreferrer" className={actionLink}>
              <MessageCircle className="h-4 w-4 text-success" /> WhatsApp
            </a>
          ) : (
            <Button size="lg" variant="outline" disabled>
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
          )}
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className={actionLink}>
              <Mail className="h-4 w-4 text-secondary" /> Send email
            </a>
          ) : (
            <Button size="lg" variant="outline" disabled>
              <Mail className="h-4 w-4" /> Send email
            </Button>
          )}
          <Button size="lg" variant="outline" onClick={() => router.push(`/contacts/${contact.id}`)}>
            View profile <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
