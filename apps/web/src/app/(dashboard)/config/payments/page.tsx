'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StripeConnectionTab } from './_components/StripeConnectionTab';
import { PaymentServicesTab } from './_components/PaymentServicesTab';
import { TransactionsTab } from './_components/TransactionsTab';

export default function ConfigPaymentsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-primary">Payments</h1>
        <p className="text-xs text-secondary mt-0.5">
          Connect your Stripe account and define the services your agent can charge contacts for.
        </p>
      </div>

      <Tabs defaultValue="connection">
        <TabsList className="mb-5">
          <TabsTrigger value="connection">Stripe connection</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
