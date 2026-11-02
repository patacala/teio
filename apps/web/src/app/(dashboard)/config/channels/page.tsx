'use client';

import { useState } from 'react';
import { Plus, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChannels } from '@/hooks/useChannels';
import type { Channel } from '@/services/channels.service';
import { ChannelCard } from './_components/ChannelCard';
import { ChannelWizard } from './_components/ChannelWizard';
import { ChannelConfigDrawer } from './_components/ChannelConfigDrawer';
import { WhatsAppLinkDialog } from './_components/WhatsAppLinkDialog';

export default function ConfigChannelsPage() {
  const { data: channels, isLoading } = useChannels();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  // null = closed; '' = link a brand-new channel; uuid = re-link an existing one
  const [whatsappLinkId, setWhatsappLinkId] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Canales de comunicación</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Conecta los canales que utilizarán tus clientes para comunicarse contigo.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setWizardOpen(true)}
          className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar canal
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl border border-border animate-pulse bg-panel" />
          ))}
        </div>
      ) : !channels?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-24 text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
            <Plug className="h-6 w-6 text-blue-500" />
          </div>
          <h3 className="font-medium text-gray-900 text-sm">Sin canales configurados</h3>
          <p className="text-xs text-gray-500 mt-1">
            Conecta WhatsApp, SMS, Email u otros canales.
          </p>
          <Button
            size="sm"
            onClick={() => setWizardOpen(true)}
            className="mt-4 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar canal
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((ch) => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              onConfigure={() => setSelectedChannel(ch)}
            />
          ))}
        </div>
      )}

      <ChannelWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSelectWhatsApp={() => setWhatsappLinkId('')}
      />

      <ChannelConfigDrawer
        channel={selectedChannel}
        open={!!selectedChannel}
        onClose={() => setSelectedChannel(null)}
        onLinkWhatsApp={(id) => setWhatsappLinkId(id)}
      />

      <WhatsAppLinkDialog
        open={whatsappLinkId !== null}
        channelId={whatsappLinkId || null}
        onClose={() => setWhatsappLinkId(null)}
      />
    </div>
  );
}
