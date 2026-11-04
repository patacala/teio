'use client';

import { useState } from 'react';
import { Mail, MonitorPlay, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDemoRequests, useRevokeDemoLink, useSendDemoEmail } from '@/hooks/useDemo';
import { toast } from '@/hooks/useToast';
import type { DemoRequest } from '@/services/demo.service';

const STATUS_STYLES: Record<string, string> = {
  processing: 'bg-warning/10 text-warning',
  ready: 'bg-success/10 text-success',
  failed: 'bg-danger/10 text-danger',
};

const STATUS_LABELS: Record<string, string> = {
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
};

const DEMO_TYPE_LABELS: Record<string, string> = {
  live_chat: 'Live Chat',
  ai_voice: 'AI Voice',
  crm: 'CRM',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${STATUS_STYLES[status] ?? 'bg-surface-raised text-secondary'}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function DemoRow({
  request,
  onRevoke,
  onSendEmail,
}: {
  request: DemoRequest;
  onRevoke: (id: string) => void;
  onSendEmail: (request: DemoRequest) => void;
}) {
  const hasExperienceLink = !!request.experience_token_id;

  return (
    <tr className="border-b border-subtle last:border-0 hover:bg-surface-raised transition-colors">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-primary">
          {request.contact_name ?? request.contact_id ?? '—'}
        </p>
        {request.contact_email && (
          <p className="text-xs text-muted">{request.contact_email}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-secondary">
          {DEMO_TYPE_LABELS[request.demo_type] ?? request.demo_type}
        </span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={request.status} />
      </td>
      <td className="px-4 py-3">
        {request.demo_url ? (
          <a
            href={request.demo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent underline underline-offset-2 truncate max-w-[180px] inline-block"
          >
            {request.demo_url}
          </a>
        ) : (
          <span className="text-xs text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-muted">
          {new Date(request.created_at).toLocaleDateString('en-US', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          {request.status === 'ready' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-accent hover:text-accent-hover hover:bg-olive-dark h-7 px-2 text-xs"
              onClick={() => onSendEmail(request)}
            >
              <Mail className="h-3.5 w-3.5 mr-1" />
              Send Email
            </Button>
          )}
          {hasExperienceLink && request.status === 'ready' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:text-danger hover:bg-danger/10 h-7 px-2 text-xs"
              onClick={() => onRevoke(request.experience_token_id!)}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Revoke
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b border-subtle">
          {Array.from({ length: 6 }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function SendEmailDialog({
  request,
  open,
  onClose,
}: {
  request: DemoRequest | null;
  open: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const sendEmail = useSendDemoEmail();

  const handleOpen = () => {
    setEmail(request?.contact_email ?? '');
  };

  const handleSend = () => {
    if (!request) return;
    const sendTo = email.trim() || undefined;
    sendEmail.mutate(
      { requestId: request.id, email: sendTo },
      {
        onSuccess: () => {
          toast({ title: 'Demo email sent', variant: 'default' });
          onClose();
        },
        onError: (err) => toast({ title: err.message, variant: 'error' }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); else handleOpen(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Demo Email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-secondary">
            Send the demo link to the contact&apos;s email or a different address.
          </p>
          <Input
            type="email"
            placeholder="Recipient email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSend} disabled={sendEmail.isPending}>
            {sendEmail.isPending ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DemoRequestsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, refetch } = useDemoRequests({ page, limit: 20 });
  const revoke = useRevokeDemoLink();
  const [emailTarget, setEmailTarget] = useState<DemoRequest | null>(null);

  const handleRevoke = (linkId: string) => {
    revoke.mutate(linkId, {
      onSuccess: () => toast({ title: 'Magic link revoked', variant: 'default' }),
      onError: (err) => toast({ title: err.message, variant: 'error' }),
    });
  };

  const totalPages = data?.meta?.total_pages ?? 1;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-primary">Demo Requests</h1>
          <p className="text-xs text-secondary mt-0.5">
            Requests received from the public demo form.
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => refetch()}
          disabled={isLoading}
          className="text-secondary h-8"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className="bg-surface border border-subtle rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-subtle bg-surface-raised">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-secondary">Contact</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-secondary">Type</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-secondary">Status</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-secondary">Demo URL</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-secondary">Date</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <TableSkeleton />
            ) : !data?.items?.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <MonitorPlay className="h-8 w-8 text-muted mx-auto mb-3" />
                  <p className="text-sm text-secondary">No demo requests yet.</p>
                </td>
              </tr>
            ) : (
              data.items.map((req) => (
                <DemoRow
                  key={req.id}
                  request={req}
                  onRevoke={handleRevoke}
                  onSendEmail={(r) => setEmailTarget(r)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-secondary">
          <span>
            Page {page} of {totalPages} — {data?.meta?.total ?? 0} records
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-7 px-3 text-xs"
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 px-3 text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Send Email Dialog */}
      <SendEmailDialog
        request={emailTarget}
        open={!!emailTarget}
        onClose={() => setEmailTarget(null)}
      />
    </div>
  );
}
