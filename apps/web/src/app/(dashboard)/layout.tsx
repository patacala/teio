import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { CommandPalette } from '@/components/command-palette';
import { ShellProvider } from '@/components/layout/shell-context';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ShellProvider>
      <div className="flex h-dvh gap-3 overflow-hidden p-3 lg:gap-4 lg:p-4">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col gap-3 lg:gap-4">
          <Header />
          <main className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2">{children}</main>
        </div>
        <CommandPalette />
      </div>
    </ShellProvider>
  );
}
