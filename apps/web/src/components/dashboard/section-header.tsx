import Link from 'next/link';

export function SectionHeader({
  icon, title, subtitle, badge, action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="icon-tile">{icon}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold leading-6 text-primary">{title}</h2>
            {badge}
          </div>
          {subtitle && <p className="truncate text-[11px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-secondary transition-colors hover:bg-surface-hover hover:text-accent"
    >
      {children}
    </Link>
  );
}

export function EmptyChart({ height, children }: { height: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center" style={{ height }}>
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}
