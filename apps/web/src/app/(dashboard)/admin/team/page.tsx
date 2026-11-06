'use client';

import { useState } from 'react';
import { Users, UserCheck, UserX, UserPlus } from 'lucide-react';
import { ASSIGNABLE_USER_ROLES, UserRole } from '@crm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useInviteMember, useTeamMembers, useUpdateMember } from '@/hooks/useTeam';
import { toast } from '@/hooks/useToast';
import type { TeamMember } from '@/services/team.service';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/utils';

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-olive-dark text-accent',
  agent: 'bg-surface-raised text-secondary',
};

function MemberRow({ member }: { member: TeamMember }) {
  const update = useUpdateMember();
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(member.role);

  const handleSave = async () => {
    try {
      await update.mutateAsync({ id: member.id, body: { role } });
      toast({ title: 'Role updated', variant: 'default' });
      setEditing(false);
    } catch {
      toast({ title: 'Error updating', variant: 'error' });
    }
  };

  const handleToggleActive = async () => {
    try {
      await update.mutateAsync({ id: member.id, body: { is_active: !member.is_active } });
      toast({ title: member.is_active ? 'Member deactivated' : 'Member activated', variant: 'default' });
    } catch {
      toast({ title: 'Error updating', variant: 'error' });
    }
  };

  return (
    <tr className="border-b border-subtle last:border-0">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-olive-dark text-accent flex items-center justify-center text-xs font-bold shrink-0">
            {getInitials(member.full_name)}
          </div>
          <div>
            <p className="text-sm font-medium text-primary">{member.full_name}</p>
            <p className="text-xs text-muted">{member.email}</p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4">
        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium capitalize', ROLE_BADGE[member.role] ?? 'bg-surface-raised text-secondary')}>
          {member.role}
        </span>
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-1.5">
          {member.is_active
            ? <UserCheck className="h-3.5 w-3.5 text-accent" />
            : <UserX className="h-3.5 w-3.5 text-muted" />}
          <span className="text-xs text-secondary">{member.is_active ? 'Active' : 'Inactive'}</span>
        </div>
      </td>
      <td className="py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => setEditing(true)}
            className="px-2 py-1 text-xs text-secondary hover:text-primary hover:bg-surface-hover rounded-sm transition-colors"
          >
            Role
          </button>
          <button
            onClick={handleToggleActive}
            disabled={update.isPending}
            className="px-2 py-1 text-xs text-secondary hover:text-primary hover:bg-surface-hover rounded-sm transition-colors"
          >
            {member.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </td>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Change role</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-xs text-secondary">{member.full_name}</p>
            <div className="flex gap-2">
              {ASSIGNABLE_USER_ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={cn('flex-1 py-2 rounded-lg text-xs font-medium border transition-colors capitalize', role === r ? 'bg-accent text-on-accent border-accent/50' : 'bg-surface text-secondary border-subtle hover:border-strong')}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={update.isPending} className="bg-accent hover:bg-accent-hover text-on-accent">
                {update.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </tr>
  );
}

function InviteMemberDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const invite = useInviteMember();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.AGENT);

  const reset = () => {
    setEmail('');
    setRole(UserRole.AGENT);
    invite.reset();
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const member = await invite.mutateAsync({ email: email.trim(), role });
      toast({ title: 'Member invited', description: member.email, variant: 'default' });
      handleOpenChange(false);
    } catch (err) {
      toast({ title: 'Error inviting member', description: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription className="text-xs">We&apos;ll email them a link to set their password and join your team.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <label htmlFor="invite-email" className="block text-xs font-medium text-primary mb-1">Email</label>
            <Input
              id="invite-email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </div>
          <div>
            <span className="block text-xs font-medium text-primary mb-1">Role</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Role">
              {ASSIGNABLE_USER_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={role === r}
                  onClick={() => setRole(r)}
                  className={cn('flex-1 py-2 rounded-lg text-xs font-medium border transition-colors capitalize', role === r ? 'bg-accent text-on-accent border-accent/50' : 'bg-surface text-secondary border-subtle hover:border-strong')}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={invite.isPending} className="bg-accent hover:bg-accent-hover text-on-accent">
              {invite.isPending ? 'Inviting…' : 'Send invite'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminTeamPage() {
  const { data: members, isLoading } = useTeamMembers();
  const [inviteOpen, setInviteOpen] = useState(false);
  const activeCount = members?.filter((m) => m.is_active).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-primary">Team</h1>
          <p className="text-xs text-secondary mt-0.5">
            {members ? `${activeCount} active member${activeCount !== 1 ? 's' : ''}` : 'Team management'}
          </p>
        </div>
        <Button size="sm" onClick={() => setInviteOpen(true)} className="gap-1.5 bg-accent hover:bg-accent-hover text-on-accent">
          <UserPlus className="h-3.5 w-3.5" /> Invite member
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl border border-subtle animate-pulse bg-surface" />
          ))}
        </div>
      ) : !members?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-subtle py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-olive-dark flex items-center justify-center mb-3">
            <Users className="h-6 w-6 text-accent" />
          </div>
          <h3 className="font-medium text-primary text-sm">No members</h3>
        </div>
      ) : (
        <div className="bg-surface border border-subtle rounded-xl overflow-hidden max-w-4xl">
          <table className="w-full">
            <thead>
              <tr className="border-b border-subtle bg-surface-raised">
                <th className="text-left py-2.5 px-4 text-xs font-medium text-secondary">Member</th>
                <th className="text-left py-2.5 pr-4 text-xs font-medium text-secondary">Role</th>
                <th className="text-left py-2.5 pr-4 text-xs font-medium text-secondary">Status</th>
                <th className="text-right py-2.5 pr-4 text-xs font-medium text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {members.map((m) => <MemberRow key={m.id} member={m} />)}
            </tbody>
          </table>
        </div>
      )}

      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
