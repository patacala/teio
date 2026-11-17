'use client';

import { RoleGate } from '@/components/layout/role-gate';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate allow={(p) => p.canAccessAdmin} deniedMessage="Only admins can open this page">
      {children}
    </RoleGate>
  );
}
