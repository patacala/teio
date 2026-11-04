'use client';

import { useState } from 'react';
import { Pencil, Trash2, Check, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  usePaymentServices,
  useCreatePaymentService,
  useUpdatePaymentService,
  useDeletePaymentService,
} from '@/hooks/usePayments';
import { usePaymentSettings } from '@/hooks/usePayments';
import { toast } from '@/hooks/useToast';
import type { PaymentService } from '@/services/payments.service';

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

interface FormState {
  name: string;
  description: string;
  amount: string; // display units (e.g. "50.00"), converted to cents on submit
}

const EMPTY_FORM: FormState = { name: '', description: '', amount: '' };

export function PaymentServicesTab() {
  const { data: settings } = usePaymentSettings();
  const { data: services, isLoading } = usePaymentServices();
  const createService = useCreatePaymentService();
  const updateService = useUpdatePaymentService();
  const deleteService = useDeletePaymentService();

  const currency = settings?.currency ?? 'usd';

  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);

  const toCents = (value: string): number => Math.round(parseFloat(value || '0') * 100);

  const startEdit = (service: PaymentService) => {
    setEditingId(service.id);
    setEditForm({
      name: service.name,
      description: service.description ?? '',
      amount: (service.amount / 100).toFixed(2),
    });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = toCents(addForm.amount);
    if (!addForm.name.trim() || cents <= 0) return;
    try {
      await createService.mutateAsync({
        name: addForm.name.trim(),
        description: addForm.description.trim() || undefined,
        amount: cents,
      });
      setAddForm(EMPTY_FORM);
      setAdding(false);
    } catch {
      toast({ title: 'Error creating the service', variant: 'error' });
    }
  };

  const handleSaveEdit = async (id: string) => {
    const cents = toCents(editForm.amount);
    if (!editForm.name.trim() || cents <= 0) return;
    try {
      await updateService.mutateAsync({
        id,
        body: { name: editForm.name.trim(), description: editForm.description.trim() || undefined, amount: cents },
      });
      setEditingId(null);
    } catch {
      toast({ title: 'Error saving the service', variant: 'error' });
    }
  };

  const handleToggleActive = async (service: PaymentService) => {
    try {
      await updateService.mutateAsync({ id: service.id, body: { is_active: !service.is_active } });
    } catch {
      toast({ title: 'Error updating the service', variant: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteService.mutateAsync(id);
    } catch {
      toast({ title: 'Error deleting the service', variant: 'error' });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2 max-w-2xl">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl border border-subtle animate-pulse bg-surface" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2 max-w-2xl">
      {!services?.length && !adding && (
        <div className="rounded-xl border-2 border-dashed border-subtle py-10 text-center">
          <p className="text-sm text-secondary">You haven&apos;t configured any services yet.</p>
        </div>
      )}

      {services?.map((service) =>
        editingId === service.id ? (
          <div key={service.id} className="bg-surface border border-subtle rounded-xl px-4 py-3 space-y-2">
            <Input
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Service name"
              className="h-8 text-sm"
              autoFocus
            />
            <Input
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description (optional)"
              className="h-8 text-sm"
            />
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={editForm.amount}
                onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="h-8 text-sm w-32"
              />
              <span className="text-xs text-muted uppercase">{currency}</span>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => handleSaveEdit(service.id)} className="text-success hover:text-success">
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={() => setEditingId(null)} className="text-muted hover:text-secondary">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div key={service.id} className="bg-surface border border-subtle rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-primary truncate">{service.name}</p>
                <Badge variant={service.is_active ? 'success' : 'default'} className="capitalize">
                  {service.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {service.description && (
                <p className="text-xs text-muted mt-0.5 truncate">{service.description}</p>
              )}
            </div>
            <p className="text-sm font-semibold text-primary shrink-0">{formatMoney(service.amount, currency)}</p>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleToggleActive(service)}
                className="px-2 py-1 text-[11px] text-muted hover:text-primary"
                title={service.is_active ? 'Deactivate' : 'Activate'}
              >
                {service.is_active ? 'Deactivate' : 'Activate'}
              </button>
              <button onClick={() => startEdit(service)} className="p-1 text-muted hover:text-accent transition-colors">
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDelete(service.id)}
                disabled={deleteService.isPending}
                className="p-1 text-muted hover:text-danger transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ),
      )}

      {adding ? (
        <form onSubmit={handleAdd} className="bg-surface border border-dashed border-subtle rounded-xl px-4 py-3 space-y-2">
          <Input
            value={addForm.name}
            onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="E.g. Initial consultation"
            className="h-8 text-sm"
            autoFocus
          />
          <Input
            value={addForm.description}
            onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Description (optional)"
            className="h-8 text-sm"
          />
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={addForm.amount}
              onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0.00"
              className="h-8 text-sm w-32"
            />
            <span className="text-xs text-muted uppercase">{currency}</span>
            <div className="ml-auto flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => { setAdding(false); setAddForm(EMPTY_FORM); }}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createService.isPending} className="bg-accent hover:bg-accent-hover text-on-accent">
                {createService.isPending ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAdding(true)}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add service
        </Button>
      )}
    </div>
  );
}
