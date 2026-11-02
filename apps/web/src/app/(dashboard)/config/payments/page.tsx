'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StripeConnectionTab } from './_components/StripeConnectionTab';
import { PaymentServicesTab } from './_components/PaymentServicesTab';
import { TransactionsTab } from './_components/TransactionsTab';

export default function ConfigPaymentsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Pagos</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Conecta tu cuenta de Stripe y define los servicios que tu agente puede cobrar a los contactos.
        </p>
      </div>

      <Tabs defaultValue="connection">
        <TabsList className="mb-5">
          <TabsTrigger value="connection">Conexión Stripe</TabsTrigger>
          <TabsTrigger value="services">Servicios</TabsTrigger>
          <TabsTrigger value="transactions">Transacciones</TabsTrigger>
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
