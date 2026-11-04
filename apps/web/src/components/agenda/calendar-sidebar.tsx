'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Settings2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCalendars, useCreateCalendar } from '@/hooks/useAppointments';
import { CalendarManagerDrawer } from './calendar-manager-drawer';
import { toast } from '@/hooks/useToast';
import { useQueryClient } from '@tanstack/react-query';

const COLOR_SWATCHES = [
  { value: '#2563EB', label: 'Blue' },
  { value: '#16a34a', label: 'Green' },
  { value: '#7c3aed', label: 'Violet' },
  { value: '#ea580c', label: 'Orange' },
  { value: '#db2777', label: 'Pink' },
];

interface CalendarSidebarProps {
  selectedId: string | null;
  onChange: (id: string | null) => void;
}

export function CalendarSidebar({ selectedId, onChange }: CalendarSidebarProps) {
  const { data: calendars = [] } = useCalendars();
  const createCalendar = useCreateCalendar();
  const queryClient = useQueryClient();
  const didRefreshAppointments = useRef(false);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#2563EB');
  const [configCalendarId, setConfigCalendarId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  // Auto-select first calendar on load, then refresh appointments so any
  // null-calendar-id appointments (assigned by the backend on listCalendars)
  // appear immediately without requiring a full page reload.
  useEffect(() => {
    if (selectedId === null && calendars.length > 0) {
      onChange(calendars[0].id);
      if (!didRefreshAppointments.current) {
        didRefreshAppointments.current = true;
        void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      }
    }
  }, [calendars, selectedId, onChange, queryClient]);

  const handleSave = async () => {
    if (!newName.trim()) return;
    try {
      const created = await createCalendar.mutateAsync({ name: newName.trim(), color: newColor });
      toast({ title: 'Calendar created' });
      setCreating(false);
      setNewName('');
      setNewColor('#2563EB');
      onChange(created.id);
    } catch {
      toast({ title: 'Error creating calendar', variant: 'error' });
    }
  };

  return (
    <div className="flex flex-col h-full p-3 gap-1">
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-xs font-semibold text-muted uppercase tracking-wide">
          Calendars
        </span>
        <button
          onClick={() => setCreating((v) => !v)}
          className="text-muted hover:text-accent-hover transition-colors"
          title="Add calendar"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Calendar list */}
      {calendars.map((cal) => (
        <div
          key={cal.id}
          className={`group flex items-start gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
            selectedId === cal.id
              ? 'bg-olive-dark text-accent'
              : 'text-primary hover:bg-surface-raised'
          }`}
          onClick={() => onChange(cal.id)}
        >
          {/* Color dot — aligned with first line */}
          <span
            className="w-2 h-2 rounded-full shrink-0 mt-1"
            style={{ backgroundColor: cal.color }}
          />
          {/* Name + ID */}
          <div className="flex-1 min-w-0">
            <span className="block text-sm truncate">{cal.name}</span>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[10px] text-muted font-mono truncate">
                {cal.id.slice(0, 8)}…
              </span>
              <button
                onClick={(e) => handleCopyId(e, cal.id)}
                className="shrink-0 text-muted hover:text-accent-hover transition-colors"
                title={`Copy ID: ${cal.id}`}
              >
                {copiedId === cal.id
                  ? <Check className="h-3 w-3 text-success" />
                  : <Copy className="h-3 w-3" />
                }
              </button>
            </div>
          </div>
          {/* Gear — visible on hover */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfigCalendarId(cal.id);
            }}
            className={`shrink-0 mt-0.5 transition-opacity ${
              selectedId === cal.id
                ? 'opacity-60 hover:opacity-100 text-accent'
                : 'opacity-0 group-hover:opacity-60 hover:opacity-100! text-secondary'
            }`}
            title="Configure"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {/* Inline create form */}
      {creating && (
        <div className="mt-1 rounded-lg border border-dashed border-accent/30 bg-olive-dark/50 p-2.5 space-y-2">
          <Input
            placeholder="Calendar name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
            className="h-7 text-xs bg-surface"
          />
          {/* Color swatches */}
          <div className="flex gap-1.5">
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                title={swatch.label}
                onClick={() => setNewColor(swatch.value)}
                className={`w-5 h-5 rounded-full border-2 transition-all ${
                  newColor === swatch.value
                    ? 'border-strong scale-110'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: swatch.value }}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!newName.trim() || createCalendar.isPending}
              className="flex-1 h-7 text-xs"
            >
              {createCalendar.isPending ? 'Saving...' : 'Save'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCreating(false);
                setNewName('');
              }}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* CalendarManagerDrawer triggered by gear icon */}
      {configCalendarId && (
        <CalendarManagerDrawer
          open={!!configCalendarId}
          onClose={() => setConfigCalendarId(null)}
          defaultCalendarId={configCalendarId}
        />
      )}
    </div>
  );
}
