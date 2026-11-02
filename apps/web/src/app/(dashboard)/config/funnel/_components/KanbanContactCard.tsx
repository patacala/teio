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

  const accent = hot ? 'text-orange-600' : 'text-blue-600';
  const iconBg = hot ? 'bg-orange-50' : 'bg-blue-50';

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
            ? 'bg-gradient-to-br from-orange-400 to-orange-700 text-white shadow-sm hover:shadow-md animate-card-pulse'
            : 'bg-white border border-border text-gray-900 hover:shadow-sm'
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
            <svg viewBox="0 0 80 80" className="absolute top-0 right-0 w-20 h-20 text-orange-700">
              <path d="M80,0 L80,80 A90,90 0 0 1 18,0 Z" fill="currentColor" />
            </svg>
            <FireIcon className="absolute top-2.5 right-2.5 h-4 w-4 text-white" />
          </div>
        ) : (
          <div className="absolute top-2.5 right-2.5 w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center">
            <BarChart3 className="h-3.5 w-3.5 text-gray-500" strokeWidth={STROKE} />
          </div>
        )}

        {/* Header: avatar + name/phone */}
        <div className="flex items-center gap-2 pr-8">
          <div
            className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${
              hot ? 'border-white text-white' : 'border-blue-200 text-blue-700'
            }`}
          >
            {initialsOf(contact)}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold truncate ${hot ? 'text-white' : 'text-gray-900'}`}>
              {contact.first_name} {contact.last_name}
            </p>
            {contact.phone && (
              <p className={`text-[11px] flex items-center gap-1 truncate ${hot ? 'text-white/85' : 'text-gray-400'}`}>
                <Phone className="h-3 w-3 shrink-0" strokeWidth={STROKE} />
                {contact.phone}
              </p>
            )}
          </div>
        </div>

        {/* Status pills + score badge */}
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold shadow-sm ${
              hot ? 'bg-white text-orange-600' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {hot ? <FireIcon className="h-3 w-3" /> : <BarChart3 className="h-3 w-3" strokeWidth={STROKE} />}
            {hot ? 'HOT' : 'NORMAL'}
          </span>
          {contact.last_activity && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium truncate ${
                hot ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              <Clock className="h-3 w-3 shrink-0" strokeWidth={STROKE} />
              Activo {relativeTime(contact.last_activity)}
            </span>
          )}
          <div className={`ml-auto w-11 h-11 rounded-full flex flex-col items-center justify-center shrink-0 ${
            hot ? 'border-2 border-white bg-transparent' : 'bg-gray-50'
          }`}>
            <span className={`text-base font-extrabold leading-none ${hot ? 'text-white' : 'text-gray-900'}`}>{score}</span>
            <span className={`text-[9px] font-semibold -mt-0.5 ${hot ? 'text-white/80' : 'text-gray-400'}`}>/100</span>
          </div>
        </div>

        {/* AI summary quote */}
        {quote && (
          <div
            className={`flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-xs italic ${
              hot ? 'bg-white/15 border-white/25 text-white/95' : 'bg-gray-50 border-gray-100 text-gray-600'
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
                <div key={key} className="bg-white rounded-lg p-2 min-w-0 shadow-sm">
                  <div className={`w-5 h-5 rounded-full ${iconBg} flex items-center justify-center mb-1`}>
                    <Icon className={`h-3 w-3 ${accent}`} strokeWidth={STROKE} />
                  </div>
                  <p className="text-[8px] font-semibold text-gray-400 uppercase tracking-wide truncate">
                    {fieldLabel(key, labels)}
                  </p>
                  {/* break-words + line-clamp, not truncate: a raw date like
                      "2026-08-31" is only 10 chars but still wider than a
                      ~75px box — truncate cut it to "2026-0…", wrapping keeps
                      it readable regardless of box width. */}
                  <p className="text-[11px] font-bold text-gray-900 leading-tight line-clamp-2 break-words">{value}</p>
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
                  hot ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                #{tag}
              </span>
            ))}
            {overflowTags > 0 && (
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  hot ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                +{overflowTags}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className={`ml-auto w-6 h-6 rounded-full flex items-center justify-center shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                hot ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
              }`}
              aria-label="Más opciones"
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
