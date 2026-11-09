/** Full-page navigation to an external URL (e.g. Stripe Checkout / Billing Portal). */
export function navigateToExternal(url: string): void {
  window.location.assign(url);
}
