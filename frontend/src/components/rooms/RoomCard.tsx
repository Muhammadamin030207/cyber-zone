'use client';

import Image from 'next/image';
import { MapPin, Star, Clock, Monitor, MessageSquare } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import type { Room } from '@/lib/types';
import { formatPrice, cn } from '@/lib/utils';

export default function RoomCard({ room }: { room: Room }) {
  const t = useTranslations('rooms');
  const img = room.images?.[0];

  const minPrice = room.zones?.length
    ? Math.min(...room.zones.map((z) => Number(z.pricePerHour)))
    : 0;

  const zoneChips = (room.zones || []).slice(0, 3);

  return (
    <Link
      href={`/rooms/${room.id}`}
      className="surface rounded-2xl overflow-hidden flex flex-col group hover:border-neon-cyan/30 transition-colors"
    >
      {/* Image */}
      <div className="relative h-44 sm:h-48 bg-cyber-800 overflow-hidden">
        {img ? (
          <Image
            src={img}
            alt={room.name}
            fill
            className="object-cover group-hover:scale-[1.04] transition-transform duration-500"
            sizes="(max-width:768px) 100vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Monitor size={56} className="text-gray-600" />
          </div>
        )}

        <div className="absolute top-3 left-3 rounded-lg bg-black/70 backdrop-blur-sm px-2.5 py-1 text-xs font-bold text-white">
          {t('perHour')} {formatPrice(minPrice)} {t('sum')}
        </div>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-2.5 flex-1">
        <h3 className="font-bold text-white text-base leading-snug line-clamp-1">{room.name}</h3>

        <p className="text-xs text-gray-400 flex items-center gap-1 truncate">
          <MapPin size={13} className="shrink-0 text-neon-cyan" />
          {room.address}
        </p>

        <div className="flex items-center gap-3 text-xs text-gray-400">
          {room.avgRating !== undefined && (
            <span className="flex items-center gap-1">
              <Star size={13} className="text-yellow-400 fill-yellow-400" />
              <b className="text-white">{room.avgRating?.toFixed(1)}</b>
              <span className="text-gray-500">({room.ratingCount})</span>
            </span>
          )}
          {room.zones && (
            <span className="flex items-center gap-1">
              <Clock size={13} className="text-neon-magenta" />
              {room.zones.length} {t('filterType')}
            </span>
          )}
          <span className="flex items-center gap-1">
            <MessageSquare size={13} /> {room._count?.reviews || 0} {t('reviews')}
          </span>
        </div>

        {zoneChips.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {zoneChips.map((z) => (
              <span
                key={z.id}
                className={cn(
                  'px-2 py-0.5 text-[11px] font-semibold rounded-md border',
                  z.type === 'VIP'
                    ? 'border-neon-magenta/40 text-neon-magenta bg-neon-magenta/10'
                    : z.type === 'CABIN'
                    ? 'border-neon-purple/40 text-neon-purple bg-neon-purple/10'
                    : 'border-neon-cyan/40 text-neon-cyan bg-neon-cyan/10'
                )}
              >
                {z.name}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto pt-3 border-t border-white/10 flex items-center justify-between">
          <span className="text-sm font-bold text-white">
            {formatPrice(minPrice)} <span className="text-xs font-medium text-gray-500">{t('sum')}/soat</span>
          </span>
          <span className="text-sm font-semibold text-neon-cyan">
            {t('viewRoom')} →
          </span>
        </div>
      </div>
    </Link>
  );
}