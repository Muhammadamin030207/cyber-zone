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

  return (
    <Link
      href={`/rooms/${room.id}`}
      className="neo-card card-hover rounded-2xl overflow-hidden flex flex-col group"
    >
      {/* Image */}
      <div className="relative h-48 bg-gradient-to-br from-cyber-800 to-cyber-950 overflow-hidden">
        <div className="absolute inset-0 grid-matrix opacity-50" />
        {img ? (
          <Image src={img} alt={room.name} fill className="object-cover group-hover:scale-105 transition-transform duration-500" sizes="(max-width:768px) 100vw, 33vw" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Monitor size={64} className="text-neon-cyan/40 group-hover:text-neon-cyan/70 transition-colors" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-cyber-950 via-transparent" />
        <div className="absolute top-3 left-3 flex gap-2">
          <span className="px-2 py-1 text-[11px] font-bold rounded-lg bg-neon-green/20 text-neon-green border border-neon-green/30">
            {t('perHour')} {formatPrice(minPrice)} {t('sum')}
          </span>
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="font-bold text-white text-lg leading-tight drop-shadow-lg">{room.name}</h3>
          <p className="text-xs text-gray-300 flex items-center gap-1 truncate">
            <MapPin size={12} className="shrink-0 text-neon-cyan" />
            {room.address}
          </p>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <p className="text-sm text-gray-400 line-clamp-2">{room.description || '—'}</p>

        <div className="flex items-center gap-3 text-xs text-gray-300">
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
        </div>

        <div className="mt-auto flex gap-2">
          {room.zones?.slice(0, 3).map((z) => (
            <span
              key={z.id}
              className={cn(
                'px-2 py-1 text-[11px] font-semibold rounded-md border',
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

        <div className="pt-1 border-t border-neon-cyan/10 flex items-center justify-between">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <MessageSquare size={12} /> {room._count?.reviews || 0} {t('reviews')}
          </span>
          <span className="text-sm font-bold neon-text">{t('viewRoom')} →</span>
        </div>
      </div>
    </Link>
  );
}