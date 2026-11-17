'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AttentionTab } from '../config/(admin)/payments/_components/AttentionTab';
import { TransactionsTab } from '../config/(admin)/payments/_components/TransactionsTab';
import { usePaymentsNeedingAttention } from '@/hooks/usePayments';

function PaymentsContent() {
  const searchParams = useSearchParams();
  const { data: attention = [] } = usePaymentsNeedingAttention();
  const defaultTab = searchParams.get('tab') === 'attention' || attention.length ? 'attention' : 'transactions';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-primary">Payments</h1>
        <p className="text-xs text-secondary mt-0.5">Payments that need your attention, and the full transaction history.</p>
      </div>

      <Tabs defaultValue={defaultTab} key={defaultTab}>
        <TabsList className="mb-5">
          <TabsTrigger value="attention">
            Needs attention{attention.length ? ` (${attention.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="attention">
          <AttentionTab />
        </TabsContent>

        <TabsContent value="transactions">
          <TransactionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense>
      <PaymentsContent />
    </Suspense>
  );
}
