'use client';

import { useState } from 'react';
import { BarChart3, Phone, Clock, Quote, MoreHorizontal } from 'lucide-react';
import { FireIcon } from '@heroicons/react/24/solid';
import type { Contact } from '@/services/contacts.service';
import { useCaptureFieldLabels } from '@/hooks/useAIAgents';
import { ContactQuickView } from './ContactQuickView';
import {
  isHot, visibleCustomFields, fieldIcon, fieldLabel, relativeTime, initialsOf,
} from './contactCardHelpers';

interface Props {
  contact: Contact;
  onDragStart: (id: string) => void;
}

const MAX_DATA_BOXES = 2;
const MAX_VISIBLE_TAGS = 1;
/** Bolder than lucide's default (2) so small icons read as solid/premium instead of thin/flimsy. */
const STROKE = 2.5;

export function KanbanContactCard({ contact, onDragStart }: Props) {
  const [open, setOpen] = useState(false);
  const { data: labels } = useCaptureFieldLabels();

  const hot = isHot(contact);
  const score = contact.lead_score ?? 0;
  const fields = visibleCustomFields(contact).slice(0, MAX_DATA_BOXES);
  const tags = contact.tags ?? [];
  const visibleTags = tags.slice(0, MAX_VISIBLE_TAGS);
  const overflowTags = tags.length - visibleTags.length;
  const quote = contact.ai_insights?.summary;

  const accent = hot ? 'text-warning' : 'text-accent';
  const iconBg = hot ? 'bg-warning/10' : 'bg-olive-dark';

  return (
    <>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', contact.id);
          onDragStart(contact.id);
        }}
        onClick={() => setOpen(true)}
        className={`relative overflow-hidden rounded-xl p-3 space-y-2 cursor-grab active:cursor-grabbing active:opacity-60 transition-shadow ${
          hot
            ? 'border border-warning/35 bg-linear-to-br from-warning/18 via-surface to-surface text-primary shadow-[0_0_22px_rgb(226_189_79/0.10)] hover:border-warning/55 animate-card-pulse'
            : 'bg-surface border border-subtle text-primary hover:shadow-xs'
        }`}
      >
        {/* Corner marker — a bold ribbon for hot leads (draws the eye); a
            plain quiet badge for normal ones (a normal lead shouldn't compete
            visually with a hot one). */}
        {hot ? (
          <div className="absolute top-0 right-0 w-12 h-12 pointer-events-none">
            {/* A straight clip-path triangle can't curve. A quadratic Bézier
                (Q) gives an S-shaped swoosh; the reference is a single
                constant-radius arc (L-shaped corner), so this uses an
                elliptical arc (A) instead. */}
            <svg viewBox="0 0 80 80" className="absolute top-0 right-0 w-20 h-20 text-warning/20">
              <path d="M80,0 L80,80 A90,90 0 0 1 18,0 Z" fill="currentColor" />
            </svg>
            <FireIcon className="absolute top-2.5 right-2.5 h-4 w-4 text-warning" />
          </div>
        ) : (
          <div className="absolute top-2.5 right-2.5 w-6 h-6 rounded-md bg-surface-raised flex items-center justify-center">
            <BarChart3 className="h-3.5 w-3.5 text-secondary" strokeWidth={STROKE} />
          </div>
        )}

        {/* Header: avatar + name/phone */}
        <div className="flex items-center gap-2 pr-8">
          <div
            className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${
              hot ? 'border-warning/40 text-warning' : 'border-accent/20 text-accent'
            }`}
          >
            {initialsOf(contact)}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold truncate text-primary`}>
              {contact.first_name} {contact.last_name}
            </p>
            {contact.phone && (
              <p className={`text-[11px] flex items-center gap-1 truncate ${hot ? 'text-primary/85' : 'text-muted'}`}>
                <Phone className="h-3 w-3 shrink-0" strokeWidth={STROKE} />
                {contact.phone}
              </p>
            )}
          </div>
        </div>

        {/* Status pills + score badge */}
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold shadow-xs ${
              hot ? 'bg-warning/15 text-warning' : 'bg-surface-raised text-secondary'
            }`}
          >
            {hot ? <FireIcon className="h-3 w-3" /> : <BarChart3 className="h-3 w-3" strokeWidth={STROKE} />}
            {hot ? 'HOT' : 'NORMAL'}
          </span>
          {contact.last_activity && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium truncate ${
                hot ? 'bg-warning/12 text-warning' : 'bg-surface-raised text-secondary'
              }`}
            >
              <Clock className="h-3 w-3 shrink-0" strokeWidth={STROKE} />
              Active {relativeTime(contact.last_activity)}
            </span>
          )}
          <div className={`ml-auto w-11 h-11 rounded-full flex flex-col items-center justify-center shrink-0 ${
            hot ? 'border-2 border-warning/50 bg-transparent' : 'bg-surface-raised'
          }`}>
            <span className={`text-base font-extrabold leading-none text-primary`}>{score}</span>
            <span className={`text-[9px] font-semibold -mt-0.5 ${hot ? 'text-primary/80' : 'text-muted'}`}>/100</span>
          </div>
        </div>

        {/* AI summary quote */}
        {quote && (
          <div
            className={`flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-xs italic ${
              hot ? 'bg-warning/8 border-warning/20 text-primary' : 'bg-surface-raised border-subtle text-secondary'
            }`}
          >
            <Quote className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-70" strokeWidth={STROKE} />
            {/* min-w-0 is load-bearing: without it a flex child refuses to
                shrink below its content's intrinsic width, so line-clamp
                never gets the chance to wrap — text just overflows instead. */}
            <span className="line-clamp-1 min-w-0">{quote}</span>
          </div>
        )}

        {/* Captured data boxes */}
        {fields.length > 0 && (
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${fields.length}, minmax(0, 1fr))` }}>
            {fields.map(([key, value]) => {
              const Icon = fieldIcon(key);
              return (
                <div key={key} className="bg-surface rounded-lg p-2 min-w-0 shadow-xs">
                  <div className={`w-5 h-5 rounded-full ${iconBg} flex items-center justify-center mb-1`}>
                    <Icon className={`h-3 w-3 ${accent}`} strokeWidth={STROKE} />
                  </div>
                  <p className="text-[8px] font-semibold text-muted uppercase tracking-wide truncate">
                    {fieldLabel(key, labels)}
                  </p>
                  {/* wrap-break-word + line-clamp, not truncate: a raw date like
                      "2026-08-31" is only 10 chars but still wider than a
                      ~75px box — truncate cut it to "2026-0…", wrapping keeps
                      it readable regardless of box width. */}
                  <p className="text-[11px] font-bold text-primary leading-tight line-clamp-2 wrap-break-word">{value}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium truncate max-w-[96px] ${
                  hot ? 'bg-warning/12 text-warning' : 'bg-surface-raised text-secondary'
                }`}
              >
                #{tag}
              </span>
            ))}
            {overflowTags > 0 && (
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  hot ? 'bg-warning/12 text-warning' : 'bg-surface-raised text-secondary'
                }`}
              >
                +{overflowTags}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className={`ml-auto w-6 h-6 rounded-full flex items-center justify-center shrink-0 outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 ${
                hot ? 'bg-warning/12 text-warning' : 'bg-surface-raised text-secondary'
              }`}
              aria-label="More options"
            >
              <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={STROKE} />
            </button>
          </div>
        )}
      </div>

      <ContactQuickView contact={contact} open={open} onOpenChange={setOpen} labels={labels} />
    </>
  );
}
