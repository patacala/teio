'use client';

export function SmsPreview({ message, orgName }: { message: string; orgName: string }) {
  return (
    <div className="w-[320px] mx-auto">
      {/* Phone frame */}
      <div className="bg-white rounded-[2.5rem] border-[3px] border-gray-200 shadow-xl overflow-hidden">
        {/* Status bar */}
        <div className="flex items-center justify-between px-6 pt-3 pb-2">
          <span className="text-[11px] font-semibold text-gray-900">9:41</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-2 rounded-sm border border-gray-400 relative">
              <div className="absolute inset-[1px] right-[2px] bg-gray-900 rounded-[1px]" />
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-xs font-bold text-blue-700">
              {orgName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-gray-900">{orgName}</p>
            <p className="text-[11px] text-gray-400">SMS</p>
          </div>
        </div>

        {/* Message area */}
        <div className="px-4 py-6 min-h-[400px] bg-white">
          {/* Timestamp */}
          <p className="text-center text-[10px] text-gray-400 mb-4">Hoy 9:41 AM</p>

          {/* Bubble */}
          <div className="max-w-[85%]">
            <div className="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-3">
              <p className="text-[14px] leading-relaxed text-gray-900 whitespace-pre-wrap">
                {message}
              </p>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="px-4 pb-4 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-9 bg-gray-100 rounded-full px-4 flex items-center">
              <span className="text-[13px] text-gray-400">Mensaje de texto</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
