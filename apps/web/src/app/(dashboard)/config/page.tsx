import { permanentRedirect } from 'next/navigation';

export default function ConfigIndexPage() {
  permanentRedirect('/config/agents');
}
