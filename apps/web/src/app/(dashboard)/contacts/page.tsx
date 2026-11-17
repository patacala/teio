import { permanentRedirect } from 'next/navigation';

export default function ContactsRedirectPage() {
  permanentRedirect('/inbox?tab=contacts');
}
