import { permanentRedirect } from 'next/navigation';

export default function IntegrationsRedirectPage() {
  permanentRedirect('/config/channels');
}
