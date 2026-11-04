'use client';

import { motion } from 'framer-motion';

interface TypingIndicatorProps {
  senderType?: 'agent' | 'ai';
}

export function TypingIndicator({ senderType = 'agent' }: TypingIndicatorProps) {
  const color = senderType === 'ai' ? 'bg-accent/70' : 'bg-surface-pressed';
  const label = senderType === 'ai' ? 'AI is typing…' : 'Agent is typing…';

  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <div className="flex items-center gap-1">
        {[0, 0.15, 0.3].map((delay, i) => (
          <motion.div
            key={i}
            className={`h-2 w-2 rounded-full ${color}`}
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, delay, repeat: Infinity }}
          />
        ))}
      </div>
      <span
        className={`text-xs ${
          senderType === 'ai'
            ? 'text-accent/75'
            : 'text-secondary'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
