export const userAuthCacheKey = (authUserId: string) => `user:auth:${authUserId}`;

/** `last_seen_at` is written at most once per user per this many seconds. */
export const LAST_SEEN_THROTTLE_SECONDS = 300;
export const lastSeenThrottleKey = (userId: string) => `user:last-seen:${userId}`;
