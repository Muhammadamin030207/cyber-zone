'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, Ticket } from 'lucide-react';
import type { Booking } from '@/lib/types';
import { formatPrice, formatDate } from '@/lib/utils';

interface Props {
  booking: Booking;
  userName?: string;
}

export default function TicketQR({ booking, userName }: Props) {
  const [qr, setQr] = useState<string>('');

  useEffect(() => {
    const data = JSON.stringify({
      type: 'CYBERARENA_TICKET',
      bookingId: booking.id,
      room: booking.room?.name,
      address: booking.room?.address,
      zone: booking.zone?.name,
      computer: booking.computer?.name || 'Auto',
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      user: userName || '',
      finalPrice: formatPrice(booking.finalPrice),
    });
    QRCode.toDataURL(data, { width: 220, margin: 1, color: { dark: '#0a0a0c', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [booking, userName]);

  return (
    <div className="neo-card rounded-2xl overflow-hidden p-5">
      <div className="flex items-center gap-2 mb-4">
        <Ticket size={18} className="text-neon-cyan" />
        <h3 className="font-bold">QR Chipta</h3>
      </div>

      <div className="flex flex-col items-center">
        {qr ? (
          <>
            <div className="p-3 bg-white rounded-2xl shadow-glow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR" className="w-44 h-44" />
            </div>
            <div className="mt-4 w-full text-center rounded-xl border border-neon-cyan/15 bg-cyber-800/50 p-3 text-sm">
              <p className="font-bold text-neon-cyan tracking-more">{booking.id.slice(0, 8).toUpperCase()}</p>
              <p className="text-gray-400 text-xs mt-1">{booking.room?.name} · {formatDate(booking.date)}</p>
              <p className="text-gray-400 text-xs">
                {booking.startTime} — {booking.endTime} · {(booking.computer?.name || 'Avtomatik')}
              </p>
            </div>
            <p className="text-[11px] text-gray-600 mt-3 text-center">
              Kiraverishda QR kodini ko'rsating
            </p>
          </>
        ) : (
          <Loader2 size={28} className="animate-spin text-neon-cyan my-8" />
        )}
      </div>
    </div>
  );
}