'use client';

import { useState } from 'react';
import { FileText, ExternalLink, Download } from 'lucide-react';
import type { InvoiceStatus } from '@crm/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TablePagination } from '@/components/ui/table-pagination';
import { useBillingInvoices } from '@/hooks/useBilling';
import { formatMoney } from '@/lib/utils';

const PAGE_SIZE = 10;

const STATUS_META: Record<InvoiceStatus, { label: string; variant: NonNullable<BadgeProps['variant']> }> = {
  paid: { label: 'Paid', variant: 'success' },
  open: { label: 'Open', variant: 'warning' },
  draft: { label: 'Draft', variant: 'default' },
  uncollectible: { label: 'Uncollectible', variant: 'destructive' },
  void: { label: 'Void', variant: 'default' },
};

export function InvoicesCard() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useBillingInvoices(page);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <FileText className="h-4 w-4 text-accent" />
        <CardTitle>Invoices</CardTitle>
      </CardHeader>
      <CardContent className="p-0 pt-4">
        {isLoading ? (
          <div className="space-y-2 px-5 pb-5">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 px-5 pb-6 text-center">
            <p className="text-sm text-primary">Could not load invoices.</p>
            <Button size="sm" variant="secondary" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : !data?.items.length ? (
          <p className="px-5 pb-6 text-center text-sm text-muted">No invoices yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-subtle border-t border-subtle">
              {data.items.map((inv) => {
                const status = STATUS_META[inv.status] ?? STATUS_META.draft;
                return (
                  <li key={inv.id} className="flex items-center gap-3 px-5 py-3 text-xs">
                    <span className="w-28 text-secondary">
                      {new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="flex-1 font-medium text-primary">
                      {formatMoney(inv.status === 'paid' ? inv.amount_paid : inv.amount_due, inv.currency)}
                    </span>
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <div className="flex w-16 justify-end gap-1">
                      {inv.invoice_url && (
                        <a href={inv.invoice_url} target="_blank" rel="noopener noreferrer" aria-label="View invoice" className="rounded p-1 text-muted hover:bg-surface-hover hover:text-primary">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {inv.invoice_pdf && (
                        <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer" aria-label="Download invoice PDF" className="rounded p-1 text-muted hover:bg-surface-hover hover:text-primary">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <TablePagination page={page} pageSize={PAGE_SIZE} total={data.meta.total} onPageChange={setPage} label="invoices" />
          </>
        )}
      </CardContent>
    </Card>
  );
}
