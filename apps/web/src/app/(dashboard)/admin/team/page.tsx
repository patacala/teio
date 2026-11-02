'use client';

import { useState } from 'react';
import { Users, Shield, UserCheck, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTeamMembers, useUpdateMember } from '@/hooks/useTeam';
import { toast } from '@/hooks/useToast';
import type { TeamMember } from '@/services/team.service';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/utils';

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-blue-50 text-blue-700',
  agent: 'bg-gray-100 text-gray-600',
};

function MemberRow({ member }: { member: TeamMember }) {
  const update = useUpdateMember();
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(member.role);

  const handleSave = async () => {
    try {
      await update.mutateAsync({ id: member.id, body: { role } });
      toast({ title: 'Rol actualizado', variant: 'default' });
      setEditing(false);
    } catch {
      toast({ title: 'Error al actualizar', variant: 'error' });
    }
  };

  const handleToggleActive = async () => {
    try {
      await update.mutateAsync({ id: member.id, body: { is_active: !member.is_active } });
      toast({ title: member.is_active ? 'Miembro desactivado' : 'Miembro activado', variant: 'default' });
    } catch {
      toast({ title: 'Error al actualizar', variant: 'error' });
    }
  };

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
            {getInitials(member.full_name)}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{member.full_name}</p>
            <p className="text-xs text-gray-400">{member.email}</p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4">
        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium capitalize', ROLE_BADGE[member.role] ?? 'bg-gray-100 text-gray-600')}>
          {member.role}
        </span>
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-1.5">
          {member.is_active
            ? <UserCheck className="h-3.5 w-3.5 text-blue-500" />
            : <UserX className="h-3.5 w-3.5 text-gray-300" />}
          <span className="text-xs text-gray-500">{member.is_active ? 'Activo' : 'Inactivo'}</span>
        </div>
      </td>
      <td className="py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => setEditing(true)}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
          >
            Rol
          </button>
          <button
            onClick={handleToggleActive}
            disabled={update.isPending}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
          >
            {member.is_active ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </td>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Cambiar rol</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-xs text-gray-500">{member.full_name}</p>
            <div className="flex gap-2">
              {['admin', 'agent'].map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={cn('flex-1 py-2 rounded-lg text-xs font-medium border transition-colors capitalize', role === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-border hover:border-gray-300')}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleSave} disabled={update.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                {update.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </tr>
  );
}

export default function AdminTeamPage() {
  const { data: members, isLoading } = useTeamMembers();
  const activeCount = members?.filter((m) => m.is_active).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Team</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {members ? `${activeCount} miembro${activeCount !== 1 ? 's' : ''} activo${activeCount !== 1 ? 's' : ''}` : 'Gestión del equipo'}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl border border-border animate-pulse bg-panel" />
          ))}
        </div>
      ) : !members?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
            <Users className="h-6 w-6 text-blue-500" />
          </div>
          <h3 className="font-medium text-gray-900 text-sm">Sin miembros</h3>
        </div>
      ) : (
        <div className="bg-panel border border-border rounded-xl overflow-hidden max-w-4xl">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Miembro</th>
                <th className="text-left py-2.5 pr-4 text-xs font-medium text-gray-500">Rol</th>
                <th className="text-left py-2.5 pr-4 text-xs font-medium text-gray-500">Estado</th>
                <th className="text-right py-2.5 pr-4 text-xs font-medium text-gray-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((m) => <MemberRow key={m.id} member={m} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
