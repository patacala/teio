'use client';

import { useEffect, useRef, useState } from 'react';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The typed text, and the same text once the user stops typing (what to
 * query). `onSettle` runs when the queried text changes, e.g. to go back to
 * the first page.
 */
export function useDebouncedSearch(onSettle?: () => void) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const onSettleRef = useRef(onSettle);

  useEffect(() => {
    onSettleRef.current = onSettle;
  }, [onSettle]);

  useEffect(() => {
    if (input === search) return;
    const timer = setTimeout(() => {
      setSearch(input);
      onSettleRef.current?.();
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input, search]);

  return { input, setInput, search };
}
