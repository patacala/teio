import { permanentRedirect } from 'next/navigation';

export default function FunnelRedirectPage() {
  permanentRedirect('/inbox?tab=pipeline');
}
