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
import {
  LayoutDashboard, MessageSquare, Users, Calendar, Bot, Plug, Settings,
} from 'lucide-react';

const navItems = [
  { label: 'Dashboard', href: '/', icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: 'Inbox', href: '/inbox', icon: <MessageSquare className="h-4 w-4" /> },
  { label: 'Contacts', href: '/contacts', icon: <Users className="h-4 w-4" /> },
  { label: 'Schedule', href: '/schedule', icon: <Calendar className="h-4 w-4" /> },
  { label: 'AI Agents', href: '/config/agents', icon: <Bot className="h-4 w-4" /> },
  { label: 'Integrations', href: '/integrations', icon: <Plug className="h-4 w-4" /> },
  { label: 'Settings', href: '/admin', icon: <Settings className="h-4 w-4" /> },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

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

  const navigate = (href: string) => {
    router.push(href);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command>
          <CommandInput placeholder="Search pages, contacts, conversations..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Navigate">
              {navItems.map((item) => (
                <CommandItem
                  key={item.href}
                  onSelect={() => navigate(item.href)}
                  className="cursor-pointer gap-2"
                >
                  {item.icon}
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
