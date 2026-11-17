'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useVoiceCall } from '@/hooks/useVoice';

/** The call drawer now lives inside the Inbox, scoped to the call's lead. */
export default function VoiceCallRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: call, isLoading, isError } = useVoiceCall(id);

  useEffect(() => {
    if (isLoading) return;
    router.replace(call?.contact_id ? `/inbox?lead=${call.contact_id}&call=${id}` : '/inbox');
  }, [isLoading, isError, call?.contact_id, id, router]);

  return null;
}
