'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone } from 'lucide-react';
import { useRealtime } from '@/providers/realtime-provider';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

interface ActiveCallIndicatorProps {
  conversationId: string;
}

export function ActiveCallIndicator({ conversationId }: ActiveCallIndicatorProps) {
  const { activeCalls } = useRealtime();
  const call = activeCalls.get(conversationId);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!call) {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [call?.callId]);

  return (
    <AnimatePresence>
      {call && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-2 px-4 py-2 bg-accent/10 border-b border-accent/30 shrink-0">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="h-2 w-2 rounded-full bg-accent/70"
            />
            <Phone className="h-3.5 w-3.5 text-accent/75" />
            <span className="text-xs font-medium text-accent/75">
              Active call{call.callerName ? ` · ${call.callerName}` : ''}
            </span>
            <span className="text-xs text-accent/75 ml-auto font-mono">
              {formatTime(elapsed)}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
