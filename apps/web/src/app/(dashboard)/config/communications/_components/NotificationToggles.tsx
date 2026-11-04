'use client';

import { Button } from '@/components/ui/button';

const NOTIFICATION_EVENTS = [
  { key: 'appointment_created', label: 'Appointment created' },
  { key: 'appointment_reminder', label: 'Reminder' },
  { key: 'appointment_cancelled', label: 'Appointment cancelled' },
  { key: 'appointment_rescheduled', label: 'Rescheduled' },
  { key: 'welcome', label: 'Welcome' },
  { key: 'team_member_invited', label: 'Team invitation' },
  { key: 'contact_created', label: 'New contact' },
  { key: 'message_received', label: 'New message' },
  { key: 'follow_up', label: 'Follow-up' },
  { key: 'conversation_assigned', label: 'Conversation assigned' },
  { key: 'invoice_paid', label: 'Invoice paid' },
  { key: 'payment_failed', label: 'Payment failed' },
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
      <h3 className="text-[13px] font-semibold text-primary mb-4">Automatic notifications</h3>
      <div className="grid grid-cols-1 gap-1">
        {NOTIFICATION_EVENTS.map((evt) => {
          const enabled = prefs[evt.key]?.enabled !== false;
          return (
            <div
              key={evt.key}
              className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-surface-raised"
            >
              <span className="text-[13px] text-primary">{evt.label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => onToggle(evt.key)}
                className={`relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer rounded-full transition-colors ${
                  enabled ? 'bg-accent' : 'bg-surface-pressed'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-[14px] w-[14px] transform rounded-full shadow transition-transform mt-[2px] ${
                    enabled ? 'translate-x-[16px] bg-on-accent' : 'translate-x-[2px] bg-white/70'
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
        {saving ? 'Saving…' : 'Save preferences'}
      </Button>
    </section>
  );
}
