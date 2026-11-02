import { cn } from '@/lib/utils';
import { MessageSquare, Phone, Globe, MessageCircle, Instagram, Mail } from 'lucide-react';

const channelConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  whatsapp: {
    icon: <MessageCircle className="h-3 w-3" />,
    label: 'WhatsApp',
    color: 'bg-emerald-100 text-emerald-700',
  },
  sms: {
    icon: <MessageSquare className="h-3 w-3" />,
    label: 'SMS',
    color: 'bg-blue-100 text-blue-700',
  },
  voice: {
    icon: <Phone className="h-3 w-3" />,
    label: 'Voice',
    color: 'bg-blue-100 text-blue-300',
  },
  webchat: {
    icon: <Globe className="h-3 w-3" />,
    label: 'Web Chat',
    color: 'bg-gray-100 text-gray-600',
  },
  facebook: {
    icon: <MessageCircle className="h-3 w-3" />,
    label: 'Facebook',
    color: 'bg-blue-100 text-blue-700',
  },
  instagram: {
    icon: <Instagram className="h-3 w-3" />,
    label: 'Instagram',
    color: 'bg-pink-100 text-pink-600',
  },
  email: {
    icon: <Mail className="h-3 w-3" />,
    label: 'Email',
    color: 'bg-violet-100 text-violet-600',
  },
};

export function ChannelBadge({
  channel,
  showLabel = false,
  className,
}: {
  channel: string;
  showLabel?: boolean;
  className?: string;
}) {
  const config = channelConfig[channel] ?? {
    icon: <MessageSquare className="h-3 w-3" />,
    label: channel,
    color: 'bg-gray-100 text-gray-600',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        config.color,
        className,
      )}
    >
      {config.icon}
      {showLabel && config.label}
    </span>
  );
}
