'use client';

import { useState } from 'react';
import { Key, Plus, Trash2, Copy, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/useApiKeysAdmin';
import { toast } from '@/hooks/useToast';
import type { ApiKeyCreated } from '@/services/api-keys-admin.service';
import { ApiDocsSection } from './_components/ApiDocsSection';

export default function AdminApiKeysPage() {
  const { data: keys, isLoading } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [revealed, setRevealed] = useState<ApiKeyCreated | null>(null);
  const [visibleKey, setVisibleKey] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await createKey.mutateAsync({ name });
      setRevealed(created);
      setVisibleKey(true);
      setOpen(false);
      setName('');
    } catch {
      toast({ title: 'Error al crear API key', variant: 'error' });
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeKey.mutateAsync(id);
      toast({ title: 'API key revocada', variant: 'default' });
    } catch {
      toast({ title: 'Error al revocar', variant: 'error' });
    }
  };

  const copyKey = () => {
    if (revealed?.key) {
      navigator.clipboard.writeText(revealed.key);
      toast({ title: 'Copiado al portapapeles', variant: 'default' });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">API Keys</h1>
          <p className="text-xs text-gray-500 mt-0.5">Llaves de acceso programático a la API del CRM.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-3.5 w-3.5" /> Crear API key
        </Button>
      </div>

      {/* Revealed key banner */}
      {revealed && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
          <p className="text-xs font-medium text-blue-800">
            Guarda esta clave ahora — no se mostrará de nuevo.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white border border-blue-200 rounded-lg px-3 py-2 font-mono text-gray-900 truncate">
              {visibleKey ? revealed.key : revealed.key_prefix + '••••••••••••••••••'}
            </code>
            <button onClick={() => setVisibleKey((v) => !v)} className="p-2 rounded-lg text-blue-500 hover:bg-blue-100 transition-colors">
              {visibleKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button onClick={copyKey} className="p-2 rounded-lg text-blue-500 hover:bg-blue-100 transition-colors">
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <button onClick={() => setRevealed(null)} className="text-xs text-blue-500 hover:text-blue-700 underline">
            Cerrar
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded-xl border border-border animate-pulse bg-panel" />)}
        </div>
      ) : !keys?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
            <Key className="h-6 w-6 text-blue-500" />
          </div>
          <h3 className="font-medium text-gray-900 text-sm">Sin API keys</h3>
          <p className="text-xs text-gray-500 mt-1">Crea una llave para acceder a la API desde tu aplicación.</p>
          <Button size="sm" onClick={() => setOpen(true)} className="mt-4 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-3.5 w-3.5" /> Crear API key
          </Button>
        </div>
      ) : (
        <div className="bg-panel border border-border rounded-xl overflow-hidden max-w-3xl">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Nombre</th>
                <th className="text-left py-2.5 pr-4 text-xs font-medium text-gray-500">Prefijo</th>
                <th className="text-left py-2.5 pr-4 text-xs font-medium text-gray-500">Creada</th>
                <th className="text-right py-2.5 pr-4 text-xs font-medium text-gray-500" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-border last:border-0">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Key className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-900">{k.name}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <code className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{k.key_prefix}…</code>
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-400">
                    {new Date(k.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <button
                      onClick={() => handleRevoke(k.id)}
                      disabled={revokeKey.isPending}
                      className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Revocar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* API Reference */}
      <div className="border-t border-border pt-5">
        <ApiDocsSection />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nueva API key</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Producción, CI/CD…" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createKey.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                {createKey.isPending ? 'Creando…' : 'Crear'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
