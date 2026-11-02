'use client';

import { motion } from 'framer-motion';
import { AIResponseIndicator } from './ai-response-indicator';

function BlinkingCursor() {
  return (
    <motion.span
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 1, repeat: Infinity }}
      className="inline-block w-0.5 h-4 bg-blue-300 ml-0.5 align-middle"
    />
  );
}

interface StreamingMessageBubbleProps {
  content: string;
}

export function StreamingMessageBubble({ content }: StreamingMessageBubbleProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex justify-end my-1 min-w-0 max-w-full"
      style={{ width: '100%' }}
    >
      <div className="max-w-[70%] min-w-0 flex flex-col items-end space-y-1">
        <AIResponseIndicator />
        <div className="rounded-xl rounded-br-sm px-3.5 py-2.5 text-sm bg-blue-600 text-white border-l-2 border-blue-300 w-fit max-w-full min-w-0 box-border">
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {content}
            <BlinkingCursor />
          </p>
        </div>
      </div>
    </motion.div>
  );
}
