'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, Smartphone, QrCode, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useCreateWhatsAppSession,
  useWhatsAppQr,
  useWhatsAppPairingCode,
} from '@/hooks/useChannels';
import type { WhatsAppSessionStatus } from '@/services/channels.service';
import { toast } from '@/hooks/useToast';

type Mode = 'qr' | 'code';

const STATUS_LABEL: Record<WhatsAppSessionStatus, string> = {
  STOPPED: 'Sesión detenida',
  STARTING: 'Iniciando sesión…',
  SCAN_QR_CODE: 'Esperando escaneo',
  PASSKEY_REQUIRED: 'Confirmación requerida en el teléfono',
  PASSKEY_CONFIRMATION_REQUIRED: 'Confirmá el código en tu teléfono',
  WORKING: 'Conectado',
  FAILED: 'Error de conexión',
};

interface Props {
  open: boolean;
  onClose(): void;
  /** Re-link an existing channel instead of creating a new one. */
  channelId?: string | null;
}

export function WhatsAppLinkDialog({ open, onClose, channelId: existingId }: Props) {
  const createSession = useCreateWhatsAppSession();
  const pairingCode = useWhatsAppPairingCode();

  const [channelId, setChannelId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('qr');
  const [phoneInput, setPhoneInput] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const { data: qrData } = useWhatsAppQr(channelId);
  const status = qrData?.status;
  const connected = qrData?.connected ?? false;

  // Create (or adopt) the session once per opening
  useEffect(() => {
    if (!open || startedRef.current) return;
    startedRef.current = true;

    if (existingId) {
      setChannelId(existingId);
      return;
    }
    createSession
      .mutateAsync({})
      .then((state) => setChannelId(state.channel_id))
      .catch((err: Error) => setCreateError(err.message));
  }, [open, existingId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset everything when the dialog closes so the next open starts clean
  useEffect(() => {
    if (open) return;
    startedRef.current = false;
    setChannelId(null);
    setMode('qr');
    setPhoneInput('');
    setCode(null);
    setCreateError(null);
  }, [open]);

  // Auto-close shortly after a successful link
  useEffect(() => {
    if (!connected) return;
    toast({ title: 'WhatsApp conectado' });
    const t = setTimeout(onClose, 1800);
    return () => clearTimeout(t);
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRequestCode = async () => {
    if (!channelId) return;
    try {
      const res = await pairingCode.mutateAsync({ id: channelId, phoneNumber: phoneInput });
      setCode(res.code);
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp</DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* Error creating the session */}
          {createError ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 py-10 text-center"
            >
              <AlertCircle className="h-10 w-10 text-red-500" />
              <p className="text-sm font-medium text-gray-900">No se pudo iniciar la sesión</p>
              <p className="text-xs text-gray-500 max-w-xs">{createError}</p>
              <Button size="sm" variant="outline" onClick={onClose} className="mt-1">
                Cerrar
              </Button>
            </motion.div>
          ) : connected ? (
            /* Linked */
            <motion.div
              key="connected"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3 py-10 text-center"
            >
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <p className="text-sm font-medium text-gray-900">WhatsApp conectado</p>
              {qrData?.phone_number && (
                <p className="text-sm text-gray-500">+{qrData.phone_number}</p>
              )}
              {qrData?.push_name && (
                <p className="text-xs text-gray-400">{qrData.push_name}</p>
              )}
            </motion.div>
          ) : (
            /* Linking */
            <motion.div
              key="linking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              {/* Mode switch */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                {(['qr', 'code'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md transition-colors ${
                      mode === m
                        ? 'bg-panel text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    {m === 'qr' ? (
                      <QrCode className="h-3.5 w-3.5" />
                    ) : (
                      <Smartphone className="h-3.5 w-3.5" />
                    )}
                    {m === 'qr' ? 'Código QR' : 'Código de 8 dígitos'}
                  </button>
                ))}
              </div>

              {mode === 'qr' ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-56 h-56 rounded-xl border border-border bg-panel flex items-center justify-center overflow-hidden">
                    {qrData?.qr ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qrData.qr}
                        alt="Código QR de WhatsApp"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Loader2 className="h-6 w-6 text-gray-300 animate-spin" />
                    )}
                  </div>
                  <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                    <li>Abrí WhatsApp en tu teléfono</li>
                    <li>Andá a Ajustes → Dispositivos vinculados</li>
                    <li>Tocá &quot;Vincular un dispositivo&quot; y escaneá</li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Número de teléfono (con código de país, solo dígitos)
                    </label>
                    <Input
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="5215512345678"
                      inputMode="numeric"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleRequestCode}
                    disabled={!channelId || !phoneInput || pairingCode.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                  >
                    {pairingCode.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Solicitar código
                  </Button>
                  {code && (
                    <div className="text-center py-2">
                      <p className="text-2xl font-semibold tracking-[0.3em] text-gray-900">
                        {code}
                      </p>
                      <p className="text-xs text-gray-500 mt-1.5">
                        Ingresá este código en WhatsApp → Dispositivos vinculados
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Live status */}
              <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 border-t border-border pt-3">
                <Loader2 className="h-3 w-3 animate-spin" />
                {status ? STATUS_LABEL[status] : 'Preparando sesión…'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
