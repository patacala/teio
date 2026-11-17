'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useCurrentUser } from '@/hooks/useTeam';
import { usePermissions } from '@/hooks/usePermissions';
import { useImpersonation } from '@/contexts/impersonation-context';
import { useContacts } from '@/hooks/useContacts';
import { leadDisplayName, leadInitials } from '@/components/lead/lead-format';
import {
  ADMIN_ITEMS,
  MAIN_ITEMS,
  PLATFORM_ITEMS,
  SETTINGS_GROUPS,
  visibleGroups,
  visibleItems,
  type NavItem,
} from '@/components/layout/sidebar-nav';

function NavCommandItem({ item, onSelect }: { item: NavItem; onSelect: (href: string) => void }) {
  const Icon = item.icon;
  return (
    <CommandItem value={item.href} onSelect={() => onSelect(item.href)} className="cursor-pointer gap-2">
      <Icon className="h-4 w-4" />
      {item.label}
    </CommandItem>
  );
}

function matches(label: string, query: string): boolean {
  return label.toLowerCase().includes(query.trim().toLowerCase());
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const router = useRouter();
  const permissions = usePermissions();
  const { data: currentUser } = useCurrentUser();
  const { isImpersonating } = useImpersonation();
  const platformOnly = currentUser?.is_platform_admin === true && !isImpersonating;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQuery('');
    }
  }, [open]);

  const navigate = (href: string) => {
    router.push(href);
    setOpen(false);
  };

  const { data: leadResults } = useContacts(
    !platformOnly && debouncedQuery.trim().length >= 2 ? { search: debouncedQuery.trim(), limit: 5 } : undefined,
  );
  const leads = !platformOnly && debouncedQuery.trim().length >= 2 ? leadResults?.items ?? [] : [];

  const mainItems = (platformOnly ? PLATFORM_ITEMS : visibleItems(MAIN_ITEMS, permissions)).filter((i) =>
    matches(i.label, query),
  );
  const settingsItems = (platformOnly ? [] : visibleGroups(SETTINGS_GROUPS, permissions).flatMap((g) => g.items)).filter(
    (i) => matches(i.label, query),
  );
  const adminItems = (platformOnly ? [] : visibleItems(ADMIN_ITEMS, permissions)).filter((i) => matches(i.label, query));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command shouldFilter={false}>
          <CommandInput placeholder="Go to… or search a lead" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {leads.length > 0 && (
              <CommandGroup heading="Leads">
                {leads.map((lead) => (
                  <CommandItem
                    key={lead.id}
                    value={lead.id}
                    onSelect={() => navigate(`/inbox?lead=${lead.id}`)}
                    className="cursor-pointer gap-2"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-olive-dark text-[10px] font-bold text-accent">
                      {leadInitials(lead)}
                    </span>
                    {leadDisplayName(lead)}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {mainItems.length > 0 && (
              <CommandGroup heading="Navigate">
                {mainItems.map((item) => (
                  <NavCommandItem key={item.href} item={item} onSelect={navigate} />
                ))}
              </CommandGroup>
            )}
            {settingsItems.length > 0 && (
              <CommandGroup heading="Settings">
                {settingsItems.map((item) => (
                  <NavCommandItem key={item.href} item={item} onSelect={navigate} />
                ))}
              </CommandGroup>
            )}
            {adminItems.length > 0 && (
              <CommandGroup heading="Admin">
                {adminItems.map((item) => (
                  <NavCommandItem key={item.href} item={item} onSelect={navigate} />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
