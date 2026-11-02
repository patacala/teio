'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { activityService } from '@/services/activity.service';

export function useContactActivity(contactId: string | null) {
  return useInfiniteQuery({
    queryKey: ['contact-activity', contactId],
    queryFn: ({ pageParam }) =>
      activityService.getContactActivity(contactId!, pageParam as string | undefined),
    enabled: !!contactId,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    // This is the query the open thread actually renders from — nothing else
    // reliably invalidates it (sending a message targets a separate
    // ['messages', conversationId] cache that this screen doesn't read), so
    // without polling, new messages never appear until a full remount.
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
