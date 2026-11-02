'use client';

import { useRouter } from 'next/navigation';
import {
  BarChart3, Phone, Copy, Clock, MoreHorizontal,
  Sparkles, Target, Smile, Zap, List,
  MessageCircle, Mail, ChevronRight, Tag as TagIcon, Plus,
} from 'lucide-react';
// Lucide's Flame is an outline-only path that reads as an unrecognizable
// blob/claw at small sizes with a bold stroke — Heroicons' solid FireIcon is
// an actual filled flame silhouette, which is what the reference design uses.
import { FireIcon } from '@heroicons/react/24/solid';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/useToast';
import type { Contact } from '@/services/contacts.service';
import { voiceService } from '@/services/voice.service';
import {
  isHot, visibleCustomFields, fieldIcon, fieldLabel, prettifySentiment,
  waLink, relativeTime, initialsOf, recommendedAction,
} from './contactCardHelpers';

interface Props {
  contact: Contact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels?: Record<string, string>;
}

/** Bolder than lucide's default (2) so small icons read as solid/premium instead of thin/flimsy. */
const STROKE = 2.5;

export function ContactQuickView({ contact, open, onOpenChange, labels }: Props) {
  const router = useRouter();
  const hot = isHot(contact);
  const score = contact.lead_score ?? 0;
  const name = `${contact.first_name} ${contact.last_name ?? ''}`.trim();
  const fields = visibleCustomFields(contact);
  const tags = contact.tags ?? [];
  const wa = waLink(contact.phone);
  const action = recommendedAction(contact);

  const copyPhone = () => {
    if (!contact.phone) return;
    navigator.clipboard.writeText(contact.phone);
    toast({ title: 'Teléfono copiado' });
  };

  const handleCall = async () => {
    if (!contact.phone) return;
    try {
      await voiceService.startCall({ contact_id: contact.id });
      toast({ title: 'Llamada iniciada', description: 'El agente está llamando al contacto.' });
    } catch {
      toast({ title: 'No se pudo iniciar la llamada' });
    }
  };

  const accent = hot ? 'text-orange-600' : 'text-blue-600';
  const tint = hot ? 'bg-orange-50' : 'bg-blue-50';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-3xl border-0" closeClassName="text-white opacity-90 hover:opacity-100">
        <DialogTitle className="sr-only">{name}</DialogTitle>

        <div className={hot ? 'bg-gradient-to-br from-orange-500 to-orange-600' : 'bg-gradient-to-br from-slate-700 to-slate-800'}>
          {/* Header */}
          <div className="px-7 pt-7 pb-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <div className="w-[92px] h-[92px] rounded-full border-[3px] border-white flex items-center justify-center text-white text-2xl font-bold">
                    {initialsOf(contact)}
                  </div>
                  <div className="absolute -top-1.5 -right-1.5 w-9 h-9 rounded-full bg-white flex items-center justify-center shadow">
                    {hot
                      ? <FireIcon className="h-5 w-5 text-orange-600" />
                      : <BarChart3 className="h-5 w-5 text-slate-700" strokeWidth={STROKE} />}
                  </div>
                </div>
                <div>
                  <h2 className="text-3xl font-extrabold text-white leading-tight">{name}</h2>
                  {contact.phone && (
                    <button
                      onClick={copyPhone}
                      className="flex items-center gap-2 text-white/90 hover:text-white mt-1 text-base rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                      <Phone className="h-[18px] w-[18px]" strokeWidth={STROKE} />
                      {contact.phone}
                      <Copy className="h-4 w-4 opacity-80" strokeWidth={STROKE} />
                    </button>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="text-4xl font-extrabold text-white leading-none">
                  {score}
                  <span className="text-lg font-semibold text-white/60">/100</span>
                </p>
                <p className="text-sm text-white/70 mt-1">Lead Score</p>
                <button
                  type="button"
                  className="text-white/60 hover:text-white/90 mt-2 inline-block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  aria-label="Más opciones"
                >
                  <MoreHorizontal className="h-5 w-5" strokeWidth={STROKE} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm font-bold">
                {hot
                  ? <FireIcon className="h-4 w-4 text-orange-600" />
                  : <BarChart3 className="h-4 w-4 text-slate-700" strokeWidth={STROKE} />}
                <span className={hot ? 'text-orange-600' : 'text-slate-700'}>{hot ? 'HOT' : 'NORMAL'}</span>
              </span>
              {contact.last_activity && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3.5 py-1.5 text-sm font-medium text-white">
                  <Clock className="h-4 w-4" strokeWidth={STROKE} />
                  Activo {relativeTime(contact.last_activity)}
                </span>
              )}
            </div>
          </div>

          {/* Body panel */}
          <div className="mx-4 mb-4 bg-white rounded-2xl p-7 grid grid-cols-1 md:grid-cols-2 gap-x-10">
            {/* Left column */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className={`h-[18px] w-[18px] ${accent}`} strokeWidth={STROKE} />
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Resumen IA</h3>
              </div>
              {contact.ai_insights?.summary ? (
                <p className="text-[15px] text-gray-800 leading-relaxed">{contact.ai_insights.summary}</p>
              ) : (
                <p className="text-[15px] text-gray-400">Sin resumen todavía.</p>
              )}

              {(contact.ai_insights?.intent || contact.ai_insights?.sentiment) && (
                <div className={`${tint} rounded-xl px-4 py-3 mt-4 space-y-1.5`}>
                  {contact.ai_insights?.intent && (
                    <div className="flex items-center gap-2 text-sm">
                      <Target className={`h-4 w-4 ${accent} shrink-0`} strokeWidth={STROKE} />
                      <span className="text-gray-500">Intención:</span>
                      <span className="font-bold text-gray-900">{contact.ai_insights.intent}</span>
                    </div>
                  )}
                  {contact.ai_insights?.sentiment && (
                    <div className="flex items-center gap-2 text-sm">
                      <Smile className={`h-4 w-4 ${accent} shrink-0`} strokeWidth={STROKE} />
                      <span className="text-gray-500">Sentimiento:</span>
                      <span className={`font-bold ${accent}`}>{prettifySentiment(contact.ai_insights.sentiment)}</span>
                    </div>
                  )}
                </div>
              )}

              {action && (
                <div className="border-t border-gray-100 mt-5 pt-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className={`h-[18px] w-[18px] ${accent}`} strokeWidth={STROKE} />
                    <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Próxima acción recomendada</h3>
                  </div>
                  <div className={`${tint} rounded-xl px-4 py-3 flex items-center justify-between gap-3`}>
                    <div className="min-w-0">
                      <p className={`font-bold ${accent}`}>{action.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{action.description}</p>
                    </div>
                    {action.channel === 'call' && contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm"
                      >
                        <Phone className={`h-[18px] w-[18px] ${accent}`} strokeWidth={STROKE} />
                      </a>
                    )}
                    {action.channel === 'email' && contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm"
                      >
                        <Mail className={`h-[18px] w-[18px] ${accent}`} strokeWidth={STROKE} />
                      </a>
                    )}
                    {action.channel === 'whatsapp' && wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm"
                      >
                        <MessageCircle className={`h-[18px] w-[18px] ${accent}`} strokeWidth={STROKE} />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="mt-6 md:mt-0">
              <div className="flex items-center gap-2 mb-3">
                <List className={`h-[18px] w-[18px] ${accent}`} strokeWidth={STROKE} />
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Datos recaudados</h3>
              </div>
              {fields.length === 0 ? (
                <p className="text-sm text-gray-400">Sin datos capturados todavía.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {fields.map(([key, value]) => {
                    const Icon = fieldIcon(key);
                    // Short values sit inline (label left, value right) like the
                    // reference; long free-text answers get their own line below
                    // the label instead of colliding with the icon/value column.
                    const long = value.length > 28;
                    return (
                      <div key={key} className="py-2.5">
                        <div className={`flex items-center gap-3 ${long ? '' : 'justify-between'}`}>
                          <div className="flex items-center gap-2.5 min-w-0 shrink-0">
                            <Icon className={`h-5 w-5 ${accent} shrink-0`} strokeWidth={STROKE} />
                            <span className="text-sm text-gray-500 truncate">{fieldLabel(key, labels)}</span>
                          </div>
                          {!long && (
                            <span className="text-sm font-bold text-gray-900 text-right truncate">{value}</span>
                          )}
                        </div>
                        {long && (
                          <p className="text-sm font-bold text-gray-900 mt-1 pl-7 leading-snug break-words">{value}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-2 mb-3 mt-6">
                <TagIcon className={`h-[18px] w-[18px] ${accent}`} strokeWidth={STROKE} />
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Tags</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className={`inline-flex rounded-full ${tint} ${accent} px-3 py-1 text-sm font-medium`}
                  >
                    #{tag}
                  </span>
                ))}
                <button
                  type="button"
                  className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-300 outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                  aria-label="Agregar tag"
                >
                  <Plus className="h-4 w-4" strokeWidth={STROKE} />
                </button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 pb-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleCall}
              disabled={!contact.phone}
              className={`flex-1 min-w-[130px] inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-white shadow-sm transition-colors ${
                hot ? 'bg-orange-600 hover:bg-orange-700' : 'bg-slate-800 hover:bg-slate-900'
              } ${!contact.phone ? 'opacity-40 pointer-events-none' : ''}`}
            >
              <Phone className="h-5 w-5" strokeWidth={STROKE} /> Llamar
            </button>
            <a
              href={wa ?? undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!wa}
              className={`flex-1 min-w-[130px] inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-bold bg-white text-gray-900 shadow-sm hover:bg-gray-50 transition-colors ${
                !wa ? 'opacity-40 pointer-events-none' : ''
              }`}
            >
              <MessageCircle className="h-5 w-5 text-green-500" strokeWidth={STROKE} /> WhatsApp
            </a>
            <a
              href={contact.email ? `mailto:${contact.email}` : undefined}
              aria-disabled={!contact.email}
              className={`flex-1 min-w-[130px] inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-bold bg-white text-gray-900 shadow-sm hover:bg-gray-50 transition-colors ${
                !contact.email ? 'opacity-40 pointer-events-none' : ''
              }`}
            >
              <Mail className="h-5 w-5 text-gray-500" strokeWidth={STROKE} /> Enviar Email
            </a>
            <button
              onClick={() => router.push(`/contacts/${contact.id}`)}
              className="flex-1 min-w-[130px] inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3.5 text-[15px] font-bold bg-white text-gray-900 shadow-sm hover:bg-gray-50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              Ver Perfil <ChevronRight className="h-5 w-5" strokeWidth={STROKE} />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
