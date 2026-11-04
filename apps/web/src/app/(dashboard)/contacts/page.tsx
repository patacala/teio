'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  useContacts,
  useCreateContact,
  useContactStats,
  useAllFunnelStages,
} from '@/hooks/useContacts';
import { contactsService } from '@/services/contacts.service';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getInitials, formatRelativeTime } from '@/lib/utils';
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Users,
  Bot,
  User,
  Download,
  Calendar,
} from 'lucide-react';
import type { Contact } from '@/services/contacts.service';

function StatCard({
  label,
  value,
  icon: Icon,
  iconClass,
  loading,
}: {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  iconClass: string;
  loading: boolean;
}) {
  return (
    <div className="bg-surface border border-subtle rounded-xl p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs text-secondary mb-0.5">{label}</p>
        {loading ? (
          <Skeleton className="h-6 w-16" />
        ) : (
          <p className="text-xl font-bold text-primary">{value?.toLocaleString() ?? '—'}</p>
        )}
      </div>
    </div>
  );
}

export default function ContactsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [stageId, setStageId] = useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [search]);

  const { data, isLoading } = useContacts({
    search: debouncedSearch || undefined,
    page,
    limit: 20,
    stage_id: stageId,
  });
  const { data: stats, isLoading: statsLoading } = useContactStats();
  const { data: allStages } = useAllFunnelStages();
  const createContact = useCreateContact();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createContact.mutateAsync(form);
    setCreateOpen(false);
    setForm({ first_name: '', last_name: '', email: '', phone: '' });
  };

  const exportAndDownload = async () => {
    const contacts = await contactsService.exportContacts();
    const headers = ['ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Lead Stage', 'Lead Score', 'Handled By', 'Created At'];
    const rows = (contacts as Contact[]).map((c) =>
      [
        c.id,
        c.first_name,
        c.last_name ?? '',
        c.email ?? '',
        c.phone ?? '',
        c.lead_stage ?? '',
        c.lead_score ?? 0,
        c.handled_by ?? 'ai',
        c.created_at,
      ].join(','),
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: 'contacts.csv' }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Contacts</h1>
          <p className="text-secondary text-sm mt-0.5">
            {stats?.total !== undefined
              ? `${stats.total.toLocaleString()} contacts`
              : 'Manage your customer contacts'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportAndDownload} className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button
            onClick={() => setCreateOpen(true)}
            className="gap-2 bg-accent hover:bg-accent-hover text-on-accent"
          >
            <Plus className="h-4 w-4" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Contacts"
          value={stats?.total}
          icon={Users}
          iconClass="bg-surface-raised text-secondary"
          loading={statsLoading}
        />
        <StatCard
          label="New This Month"
          value={stats?.new_this_month}
          icon={Calendar}
          iconClass="bg-olive-dark text-accent"
          loading={statsLoading}
        />
        <StatCard
          label="AI Handled"
          value={stats?.ai_handled}
          icon={Bot}
          iconClass="bg-olive-dark text-accent"
          loading={statsLoading}
        />
        <StatCard
          label="Human Handled"
          value={stats?.human_handled}
          icon={User}
          iconClass="bg-surface-raised text-secondary"
          loading={statsLoading}
        />
      </div>

      {/* Table card */}
      <Card>
        {/* Filters */}
        <div className="p-4 border-b border-subtle flex gap-3 items-center">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              placeholder="Search contacts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={stageId ?? 'all'}
            onValueChange={(val) => {
              setStageId(val === 'all' ? undefined : val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {allStages?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-subtle">
                {['Name', 'Email', 'Phone', 'Stage', 'Score', 'Handled By', 'Last Activity'].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left text-[11px] font-semibold text-muted uppercase tracking-wider px-4 py-3"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-subtle">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data?.items?.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-surface-raised flex items-center justify-center mb-3">
                        <Users className="h-5 w-5 text-muted" />
                      </div>
                      <p className="text-sm font-medium text-primary">
                        {debouncedSearch ? `No results for "${debouncedSearch}"` : 'No contacts yet'}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {debouncedSearch
                          ? 'Try a different search term'
                          : 'Add your first contact to get started'}
                      </p>
                      {!debouncedSearch && (
                        <Button
                          onClick={() => setCreateOpen(true)}
                          variant="outline"
                          size="sm"
                          className="mt-4 gap-2"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Contact
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                data?.items?.map((contact) => {
                  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Anonymous';
                  const stage = allStages?.find((s) => s.id === contact.lead_stage);
                  const score = contact.lead_score ?? 0;
                  return (
                    <tr
                      key={contact.id}
                      onClick={() => router.push(`/contacts/${contact.id}`)}
                      className="border-b border-subtle hover:bg-surface-raised transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-olive-dark text-accent flex items-center justify-center text-xs font-bold shrink-0">
                            {getInitials(fullName)}
                          </div>
                          <span className="text-sm font-medium text-primary">{fullName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-secondary">
                        {contact.email ?? <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-secondary">
                        {contact.phone ?? <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {stage ? (
                          <span className="bg-surface-raised text-primary text-[11px] rounded-full px-2 py-0.5 font-medium">
                            {stage.name}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-[72px]">
                          <div className="flex-1 bg-surface-raised rounded-full h-1.5">
                            <div
                              className="bg-accent h-1.5 rounded-full"
                              style={{ width: `${score}%` }}
                            />
                          </div>
                          <span className="text-xs text-secondary w-6 text-right">{score}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {contact.handled_by === 'human' ? (
                          <span className="bg-surface-raised text-primary text-[11px] rounded-full px-2 py-0.5 font-medium">
                            Human
                          </span>
                        ) : (
                          <span className="bg-olive-dark text-accent text-[11px] rounded-full px-2 py-0.5 font-medium">
                            AI
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {contact.last_contacted_at
                          ? formatRelativeTime(contact.last_contacted_at)
                          : contact.created_at
                            ? formatRelativeTime(contact.created_at)
                            : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data?.meta && data.meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-subtle">
            <p className="text-xs text-secondary">
              Page {data.meta.page} of {data.meta.total_pages} ·{' '}
              {data.meta.total.toLocaleString()} contacts
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(data.meta.total_pages, p + 1))}
                disabled={page === data.meta.total_pages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create Contact Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-primary mb-1.5">First name</label>
                <Input
                  required
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  placeholder="Ana"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-primary mb-1.5">Last name</label>
                <Input
                  required
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  placeholder="García"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-primary mb-1.5">Email</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="ana@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-primary mb-1.5">Phone</label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+1 555 000 0000"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-accent hover:bg-accent-hover text-on-accent"
                disabled={createContact.isPending}
              >
                {createContact.isPending ? 'Creating…' : 'Create Contact'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
