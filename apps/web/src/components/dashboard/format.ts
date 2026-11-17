/** Whole-unit currency for dashboards ("$1,490"); "—" while the value is unknown. */
export function formatMoney(cents: number | undefined, currency: string = 'usd'): string {
  if (cents === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Large amounts stay readable in a narrow cell: "$12.4k", "$1.2M". */
export function formatMoneyCompact(cents: number | undefined, currency: string = 'usd'): string {
  if (cents === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(cents / 100);
}
