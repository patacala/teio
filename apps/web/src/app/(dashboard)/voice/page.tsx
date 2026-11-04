'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { useVoiceCalls, useVoiceCallStats } from '@/hooks/useVoice';
import { TablePagination } from '@/components/ui/table-pagination';
import type { VoiceCall, VoiceCallStatus } from '@/services/voice.service';

const PAGE_SIZE = 25;

function formatDuration(sec: number | null): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function contactName(call: VoiceCall): string {
  const c = call.contact;
  if (!c) return 'Unknown contact';
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed';
}

/** The counterparty number: on outbound calls that's who we dialed (phone_to), on inbound who dialed us (phone_from). */
function counterpartyPhone(call: VoiceCall): string {
  return call.direction === 'outbound' ? call.phone_to : call.phone_from;
}

const STATUS_CLASSES: Record<VoiceCallStatus, string> = {
  in_progress: 'bg-success/15 text-success',
  completed: 'bg-olive-dark text-accent',
  failed: 'bg-danger/15 text-danger',
  initiated: 'bg-surface-raised text-secondary',
};

function StatusBadge({ status }: { status: VoiceCallStatus }) {
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_CLASSES[status] ?? 'bg-surface-raised text-secondary'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

export default function VoicePage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useVoiceCalls({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const { data: stats } = useVoiceCallStats();

  const calls = data?.items ?? [];
  // Counted org-wide in SQL, not from the visible page.
  const total = stats?.total ?? data?.meta.total ?? 0;
  const activeCalls = stats?.active ?? 0;
  const avgDuration = formatDuration(stats?.avg_duration_seconds ?? null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-primary">Voice</h1>
        <p className="text-sm text-secondary mt-0.5">AI-powered voice calls and live transcripts.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Calls', value: String(total) },
          { label: 'Active Now', value: String(activeCalls) },
          { label: 'Avg Duration', value: avgDuration },
        ].map(({ label, value }) => (
          <div key={label} className="bg-surface border border-subtle rounded-xl p-4">
            <p className="text-xs text-secondary">{label}</p>
            <p className="text-2xl font-semibold text-primary mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-surface border border-subtle rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-subtle bg-surface-raised">
              {['Call ID', 'Contact', 'Direction', 'Status', 'Duration', 'Started'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-secondary">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-subtle">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-surface-raised rounded-sm animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))
            ) : calls.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <Phone className="w-8 h-8 text-muted mx-auto mb-2" />
                  <p className="text-sm text-muted">No calls yet</p>
                </td>
              </tr>
            ) : (
              calls.map((call) => (
                <tr
                  key={call.id}
                  className="border-b border-subtle last:border-0 hover:bg-surface-raised cursor-pointer transition-colors"
                  onClick={() => router.push(`/voice/${call.id}`)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-secondary">
                    {call.external_call_id.length > 12
                      ? call.external_call_id.slice(0, 12) + '…'
                      : call.external_call_id}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-primary font-medium">{contactName(call)}</p>
                    <p className="text-xs text-muted">{counterpartyPhone(call)}</p>
                  </td>
                  <td className="px-4 py-3">
                    {call.direction === 'outbound' ? (
                      <span className="inline-flex items-center gap-1 text-xs text-accent">
                        <PhoneOutgoing className="w-3.5 h-3.5" /> Outbound
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-success">
                        <PhoneIncoming className="w-3.5 h-3.5" /> Inbound
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={call.status} />
                  </td>
                  <td className="px-4 py-3 text-secondary">{formatDuration(call.duration_seconds)}</td>
                  <td className="px-4 py-3 text-secondary">{formatDate(call.started_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <TablePagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          label="calls"
        />
      </div>
    </div>
  );
}
