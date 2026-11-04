'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  MessageSquare, Phone, Globe, Instagram, Video, Zap, Webhook,
  CheckCircle2, Circle, ChevronRight, Settings2, ExternalLink, Search,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type IntegrationStatus = 'connected' | 'available' | 'coming_soon';

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: IntegrationStatus;
  category: string;
  color: string;
}

const integrations: Integration[] = [
  // Messaging
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Official Meta Business API. Send and receive WhatsApp messages.',
    icon: <MessageSquare className="h-5 w-5" />,
    status: 'available',
    category: 'messaging',
    color: 'text-success',
  },
  {
    id: 'sms',
    name: 'SMS / Twilio',
    description: 'Send SMS messages globally via Twilio infrastructure.',
    icon: <Phone className="h-5 w-5" />,
    status: 'connected',
    category: 'messaging',
    color: 'text-danger',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    description: 'Connect Facebook Messenger for your business page.',
    icon: <MessageSquare className="h-5 w-5" />,
    status: 'available',
    category: 'messaging',
    color: 'text-accent',
  },
  {
    id: 'instagram',
    name: 'Instagram DM',
    description: 'Reply to Instagram DMs directly from your inbox.',
    icon: <Instagram className="h-5 w-5" />,
    status: 'available',
    category: 'messaging',
    color: 'text-chart-pink',
  },
  {
    id: 'webchat',
    name: 'Web Chat',
    description: 'Embeddable chat widget for your website or app.',
    icon: <Globe className="h-5 w-5" />,
    status: 'connected',
    category: 'messaging',
    color: 'text-accent',
  },
  // Voice
  {
    id: 'retell',
    name: 'Retell AI',
    description: 'AI-powered voice calls with natural language understanding.',
    icon: <Video className="h-5 w-5" />,
    status: 'connected',
    category: 'voice',
    color: 'text-accent',
  },
  // Automation
  {
    id: 'n8n',
    name: 'n8n',
    description: 'Connect n8n workflows to automate CRM actions.',
    icon: <Zap className="h-5 w-5" />,
    status: 'available',
    category: 'automation',
    color: 'text-warning',
  },
  {
    id: 'webhooks',
    name: 'Webhooks',
    description: 'Send HTTP POST events to any external endpoint.',
    icon: <Webhook className="h-5 w-5" />,
    status: 'connected',
    category: 'automation',
    color: 'text-chart-purple',
  },
];

const categories = [
  { id: 'all', label: 'All' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'voice', label: 'Voice' },
  { id: 'automation', label: 'Automation' },
];

const STATUS_CONFIG: Record<IntegrationStatus, { label: string; icon: React.ReactNode; className: string }> = {
  connected: {
    label: 'Connected',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    className: 'bg-success/10 text-success border-success/25',
  },
  available: {
    label: 'Available',
    icon: <Circle className="h-3.5 w-3.5" />,
    className: 'bg-surface-raised text-secondary border-subtle',
  },
  coming_soon: {
    label: 'Coming Soon',
    icon: <Circle className="h-3.5 w-3.5" />,
    className: 'bg-warning/10 text-warning border-warning/25',
  },
};

function IntegrationCard({ integration, index }: { integration: Integration; index: number }) {
  const status = STATUS_CONFIG[integration.status];
  const isConnected = integration.status === 'connected';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Card className={cn(
        'group hover:shadow-md transition-all duration-200 hover:-translate-y-0.5',
        isConnected && 'ring-1 ring-success/30',
      )}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className={cn(
              'w-10 h-10 rounded-tile border border-subtle bg-surface-raised flex items-center justify-center shrink-0',
              integration.color,
            )}>
              {integration.icon}
            </div>
            <span className={cn(
              'inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border',
              status.className,
            )}>
              {status.icon}
              {status.label}
            </span>
          </div>

          <h3 className="font-semibold text-primary text-sm mb-1">
            {integration.name}
          </h3>
          <p className="text-xs text-secondary leading-relaxed mb-4">
            {integration.description}
          </p>

          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs flex-1">
                  <Settings2 className="h-3.5 w-3.5" />
                  Configure
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <ExternalLink className="h-3.5 w-3.5 text-muted" />
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs flex-1"
                disabled={integration.status === 'coming_soon'}
              >
                Connect
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function IntegrationsPage() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = integrations.filter((i) => {
    const matchesCat = activeCategory === 'all' || i.category === activeCategory;
    const matchesSearch = i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.description.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const connectedCount = integrations.filter(i => i.status === 'connected').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">Integrations</h1>
          <p className="text-secondary text-sm mt-0.5">
            {connectedCount} of {integrations.length} integrations active
          </p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input
            placeholder="Search integrations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 bg-surface-raised rounded-lg p-0.5">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                activeCategory === cat.id
                  ? 'bg-surface text-primary shadow-xs'
                  : 'text-secondary hover:text-primary',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-2xl bg-surface-raised flex items-center justify-center mb-4">
            <Zap className="h-5 w-5 text-muted" />
          </div>
          <p className="text-sm font-medium text-primary">No integrations found</p>
          <p className="text-xs text-muted mt-1">Try adjusting your search or filter</p>
        </div>
      ) : (
        <>
          {(activeCategory === 'all' || activeCategory === 'messaging') && filtered.filter(i => i.category === 'messaging').length > 0 && (
            <section>
              {activeCategory === 'all' && (
                <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                  Messaging
                </h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.filter(i => i.category === 'messaging').map((int, idx) => (
                  <IntegrationCard key={int.id} integration={int} index={idx} />
                ))}
              </div>
            </section>
          )}

          {(activeCategory === 'all' || activeCategory === 'voice') && filtered.filter(i => i.category === 'voice').length > 0 && (
            <section>
              {activeCategory === 'all' && (
                <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 mt-2">
                  Voice
                </h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.filter(i => i.category === 'voice').map((int, idx) => (
                  <IntegrationCard key={int.id} integration={int} index={idx} />
                ))}
              </div>
            </section>
          )}

          {(activeCategory === 'all' || activeCategory === 'automation') && filtered.filter(i => i.category === 'automation').length > 0 && (
            <section>
              {activeCategory === 'all' && (
                <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 mt-2">
                  Automation
                </h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.filter(i => i.category === 'automation').map((int, idx) => (
                  <IntegrationCard key={int.id} integration={int} index={idx} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
