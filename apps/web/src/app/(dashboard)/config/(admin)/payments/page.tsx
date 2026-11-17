'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StripeConnectionTab } from './_components/StripeConnectionTab';
import { PaymentServicesTab } from './_components/PaymentServicesTab';
import { TransactionsTab } from './_components/TransactionsTab';
import { AttentionTab } from './_components/AttentionTab';
import { usePaymentsNeedingAttention } from '@/hooks/usePayments';
import { useCurrentUser } from '@/hooks/useTeam';

export default function ConfigPaymentsPage() {
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  const { data: attention = [] } = usePaymentsNeedingAttention(isAdmin);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-primary">Payments</h1>
        <p className="text-xs text-secondary mt-0.5">
          Connect your Stripe account and define the services your agent can charge contacts for.
        </p>
      </div>

      <Tabs defaultValue={attention.length ? 'attention' : 'connection'} key={attention.length ? 'attention' : 'default'}>
        <TabsList className="mb-5">
          <TabsTrigger value="connection">Stripe connection</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="attention">Needs attention{attention.length ? ` (${attention.length})` : ''}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="connection">
          <StripeConnectionTab />
        </TabsContent>

        <TabsContent value="services">
          <PaymentServicesTab />
        </TabsContent>

        <TabsContent value="transactions">
          <TransactionsTab />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="attention">
            <AttentionTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
