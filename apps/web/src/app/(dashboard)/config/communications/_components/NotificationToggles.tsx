'use client';

import { Button } from '@/components/ui/button';

const NOTIFICATION_EVENTS = [
  { key: 'appointment_created', label: 'Cita creada' },
  { key: 'appointment_reminder', label: 'Recordatorio' },
  { key: 'appointment_cancelled', label: 'Cita cancelada' },
  { key: 'appointment_rescheduled', label: 'Reprogramada' },
  { key: 'welcome', label: 'Bienvenida' },
  { key: 'team_member_invited', label: 'Invitación equipo' },
  { key: 'contact_created', label: 'Nuevo contacto' },
  { key: 'message_received', label: 'Mensaje nuevo' },
  { key: 'follow_up', label: 'Seguimiento' },
  { key: 'conversation_assigned', label: 'Conv. asignada' },
  { key: 'invoice_paid', label: 'Factura pagada' },
  { key: 'payment_failed', label: 'Pago fallido' },
];

interface Props {
  prefs: Record<string, { enabled: boolean }>;
  onToggle: (key: string) => void;
  onSave: () => void;
  saving?: boolean;
}

export function NotificationToggles({ prefs, onToggle, onSave, saving }: Props) {
  return (
    <section>
      <h3 className="text-[13px] font-semibold text-gray-900 mb-4">Notificaciones automáticas</h3>
      <div className="grid grid-cols-1 gap-1">
        {NOTIFICATION_EVENTS.map((evt) => {
          const enabled = prefs[evt.key]?.enabled !== false;
          return (
            <div
              key={evt.key}
              className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-gray-50"
            >
              <span className="text-[13px] text-gray-700">{evt.label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => onToggle(evt.key)}
                className={`relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer rounded-full transition-colors ${
                  enabled ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-[14px] w-[14px] transform rounded-full bg-white shadow transition-transform mt-[2px] ${
                    enabled ? 'translate-x-[16px]' : 'translate-x-[2px]'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onSave}
        disabled={saving}
        className="w-full text-xs mt-3"
      >
        {saving ? 'Guardando…' : 'Guardar preferencias'}
      </Button>
    </section>
  );
}
