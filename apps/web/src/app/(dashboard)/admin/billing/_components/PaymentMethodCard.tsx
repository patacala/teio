'use client';

import { CreditCard, Plus, ExternalLink } from 'lucide-react';
import type { BillingPaymentMethod } from '@crm/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function describe(pm: BillingPaymentMethod): string {
  const brand = pm.brand ? pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1) : pm.type.replace(/_/g, ' ');
  return pm.last4 ? `${brand} •••• ${pm.last4}` : brand;
}

interface PaymentMethodCardProps {
  paymentMethod: BillingPaymentMethod | null;
  required: boolean;
  hasCustomer: boolean;
  onConnect: () => void;
  onOpenPortal: () => void;
  connectPending: boolean;
  portalPending: boolean;
}

export function PaymentMethodCard({
  paymentMethod,
  required,
  hasCustomer,
  onConnect,
  onOpenPortal,
  connectPending,
  portalPending,
}: PaymentMethodCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment method</CardTitle>
        <CardDescription>Used for your subscription invoices. Card details are stored by Stripe.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {paymentMethod ? (
          <div className="inset-surface flex items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-secondary" />
              <div>
                <p className="text-sm font-medium text-primary">{describe(paymentMethod)}</p>
                {paymentMethod.exp_month && paymentMethod.exp_year && (
                  <p className="text-xs text-muted">
                    Expires {String(paymentMethod.exp_month).padStart(2, '0')}/{String(paymentMethod.exp_year).slice(-2)}
                  </p>
                )}
              </div>
            </div>
            {paymentMethod.is_expired ? <Badge variant="destructive">Expired</Badge> : <Badge variant="success">Default</Badge>}
          </div>
        ) : (
          <div className="inset-surface flex flex-col items-center gap-2 px-4 py-6 text-center">
            <CreditCard className="h-6 w-6 text-muted" />
            <p className="text-sm font-medium text-primary">No payment method connected</p>
            <p className="text-xs text-muted">
              {required
                ? 'Your paid plan needs a payment method to keep renewing.'
                : 'Connect one now so upgrading is a single click.'}
            </p>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {hasCustomer && (
            <Button size="sm" variant="ghost" onClick={onOpenPortal} disabled={portalPending}>
              <ExternalLink className="h-3.5 w-3.5" />
              {portalPending ? 'Opening…' : 'Billing portal'}
            </Button>
          )}
          <Button size="sm" variant={paymentMethod ? 'secondary' : 'default'} onClick={onConnect} disabled={connectPending}>
            <Plus className="h-3.5 w-3.5" />
            {connectPending ? 'Redirecting…' : paymentMethod ? 'Replace payment method' : 'Connect payment method'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
