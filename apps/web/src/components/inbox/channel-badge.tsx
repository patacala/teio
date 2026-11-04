import { cn } from '@/lib/utils';
import { MessageSquare, Phone, Globe, MessageCircle, Instagram, Mail } from 'lucide-react';

const channelConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  whatsapp: {
    icon: <MessageCircle className="h-3 w-3" />,
    label: 'WhatsApp',
    color: 'bg-success/15 text-success',
  },
  sms: {
    icon: <MessageSquare className="h-3 w-3" />,
    label: 'SMS',
    color: 'bg-olive-dark text-accent',
  },
  voice: {
    icon: <Phone className="h-3 w-3" />,
    label: 'Voice',
    color: 'bg-olive-dark text-accent/75',
  },
  webchat: {
    icon: <Globe className="h-3 w-3" />,
    label: 'Web Chat',
    color: 'bg-surface-raised text-secondary',
  },
  facebook: {
    icon: <MessageCircle className="h-3 w-3" />,
    label: 'Facebook',
    color: 'bg-olive-dark text-accent',
  },
  instagram: {
    icon: <Instagram className="h-3 w-3" />,
    label: 'Instagram',
    color: 'bg-chart-pink/15 text-chart-pink',
  },
  email: {
    icon: <Mail className="h-3 w-3" />,
    label: 'Email',
    color: 'bg-chart-purple/15 text-chart-purple',
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
    color: 'bg-surface-raised text-secondary',
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
