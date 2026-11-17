import { permanentRedirect } from 'next/navigation';

export default async function ContactRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/inbox?lead=${id}`);
}
