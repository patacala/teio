import { permanentRedirect } from 'next/navigation';

export default function VoiceRedirectPage() {
  permanentRedirect('/inbox?tab=calls');
}
