'use client';

import { useState } from 'react';
import { BarChart3, Phone, Clock, Quote, Flame } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Contact } from '@/services/contacts.service';
import { useCaptureFieldLabels } from '@/hooks/useAIAgents';
import { cn } from '@/lib/utils';
import { ContactQuickView } from './ContactQuickView';
import {
  isHot, visibleCustomFields, fieldIcon, fieldLabel, relativeTime, initialsOf, lastActivity,
} from './contactCardHelpers';

interface Props {
  contact: Contact;
  onDragStart: (id: string) => void;
}

const MAX_DATA_BOXES = 2;
const MAX_VISIBLE_TAGS = 1;

export function KanbanContactCard({ contact, onDragStart }: Props) {
  const [open, setOpen] = useState(false);
  const { data: labels } = useCaptureFieldLabels();

  const hot = isHot(contact);
  const score = contact.lead_score ?? 0;
  const name = `${contact.first_name} ${contact.last_name ?? ''}`.trim();
  const fields = visibleCustomFields(contact).slice(0, MAX_DATA_BOXES);
  const tags = contact.tags ?? [];
  const visibleTags = tags.slice(0, MAX_VISIBLE_TAGS);
  const overflowTags = tags.length - visibleTags.length;
  const quote = contact.ai_insights?.summary;
  const activity = lastActivity(contact);
  const accent = hot ? 'text-warning' : 'text-accent';

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${name || 'contact'}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', contact.id);
          onDragStart(contact.id);
        }}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'relative overflow-hidden rounded-xl border p-3 space-y-2 cursor-grab active:cursor-grabbing active:opacity-60 transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-accent/40',
          hot
            ? 'border-warning/35 bg-warning/8 hover:border-warning/55'
            : 'border-subtle bg-surface hover:bg-surface-hover',
        )}
      >
        {hot && (
          <div aria-hidden className="absolute -top-6 -right-6 h-14 w-14 rounded-full bg-warning/15" />
        )}

        <div className="relative flex items-center gap-2 pr-6">
          <div
            className={cn(
              'w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold shrink-0',
              hot ? 'border-warning/40 text-warning' : 'border-accent/20 bg-olive-dark text-accent',
            )}
          >
            {initialsOf(contact)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-primary">{name}</p>
            {contact.phone && (
              <p className="text-[11px] flex items-center gap-1 truncate text-muted">
                <Phone className="h-3 w-3 shrink-0" />
                {contact.phone}
              </p>
            )}
          </div>
          {hot && <Flame aria-hidden className="absolute right-0 top-0 h-4 w-4 text-warning" fill="currentColor" />}
        </div>

        <div className="relative flex items-center gap-1.5">
          <Badge variant={hot ? 'warning' : 'neutral'} className="gap-1">
            {hot ? <Flame className="h-3 w-3" fill="currentColor" /> : <BarChart3 className="h-3 w-3" />}
            {hot ? 'HOT' : 'NORMAL'}
          </Badge>
          {activity && (
            <Badge variant="neutral" className="gap-1 truncate normal-case">
              <Clock className="h-3 w-3 shrink-0" />
              Active {relativeTime(activity)}
            </Badge>
          )}
          <div
            className={cn(
              'ml-auto w-11 h-11 rounded-full flex flex-col items-center justify-center shrink-0',
              hot ? 'border-2 border-warning/50' : 'bg-surface-raised',
            )}
            aria-label={`Lead score ${score} of 100`}
          >
            <span className="text-base font-bold leading-none text-primary">{score}</span>
            <span className="text-[9px] font-semibold -mt-0.5 text-muted">/100</span>
          </div>
        </div>

        {quote && (
          <div
            className={cn(
              'flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-xs italic',
              hot ? 'border-warning/20 bg-warning/8 text-primary' : 'border-subtle bg-surface-raised text-secondary',
            )}
          >
            <Quote className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted" />
            <span className="line-clamp-1 min-w-0">{quote}</span>
          </div>
        )}

        {fields.length > 0 && (
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${fields.length}, minmax(0, 1fr))` }}>
            {fields.map(([key, value]) => {
              const Icon = fieldIcon(key);
              return (
                <div key={key} className="inset-surface rounded-lg p-2 min-w-0">
                  <Icon className={cn('h-3.5 w-3.5 mb-1', accent)} />
                  <p className="text-[9px] font-semibold text-muted uppercase tracking-wide truncate">
                    {fieldLabel(key, labels)}
                  </p>
                  <p className="text-[11px] font-semibold text-primary leading-tight line-clamp-2 wrap-break-word">{value}</p>
                </div>
              );
            })}
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {visibleTags.map((tag) => (
              <Badge key={tag} variant={hot ? 'warning' : 'neutral'} className="max-w-[96px] truncate normal-case">
                #{tag}
              </Badge>
            ))}
            {overflowTags > 0 && (
              <Badge variant={hot ? 'warning' : 'neutral'}>+{overflowTags}</Badge>
            )}
          </div>
        )}
      </div>

      <ContactQuickView contact={contact} open={open} onOpenChange={setOpen} labels={labels} />
    </>
  );
}
