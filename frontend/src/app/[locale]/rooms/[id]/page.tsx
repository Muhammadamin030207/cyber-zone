'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  MapPin, Phone, Clock, Star, MessageSquare, Monitor, Cpu, MemoryStick, Video,
  ChevronLeft, Gamepad2, Users, Rocket, ShieldCheck, Sparkles,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import type { Room, AvailabilityZone } from '@/lib/types';
import { formatPrice, formatDate, todayISO, cn } from '@/lib/utils';
import BookingWidget from '@/components/booking/BookingWidget';
import BarOrdering from '@/components/bar/BarOrdering';
import ChatPanel from '@/components/chat/ChatPanel';

export default function RoomDetailPage({ params }: { params: Promise<{ locale: string }> }) {
  void params;
  const paramsNext = useParams();
  const roomId = typeof paramsNext.id === 'string' ? paramsNext.id : null;
  const t = useTranslations('room');
  const tCommon = useTranslations('common');

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [availability, setAvailability] = useState<AvailabilityZone[]>([]);

  const fetchRoom = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/api/rooms/${roomId}`);
      setRoom(data.data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  const fetchAvailability = useCallback(async () => {
    if (!roomId) return;
    try {
      const { data } = await api.get(`/api/bookings/rooms/${roomId}/availability?date=${date}`);
      setAvailability(data.data.zones || []);
    } catch {
      setAvailability([]);
    }
  }, [roomId, date]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  useEffect(() => {
    if (roomId) fetchAvailability();
  }, [fetchAvailability, roomId]);

  const minPrice = useMemo(() => {
    if (!room?.zones?.length) return 0;
    return Math.min(...room.zones.map((z) => Number(z.pricePerHour)));
  }, [room]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="neo-card rounded-2xl h-72 animate-pulse" />
          <div className="neo-card rounded-2xl h-48 animate-pulse" />
        </div>
        <div className="neo-card rounded-2xl h-96 animate-pulse" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center">
        <Gamepad2 size={48} className="mx-auto mb-4 text-gray-600" />
        <p className="text-gray-400">{error || 'Xona topilmadi'}</p>
        <Link href="/rooms" className="inline-flex items-center gap-2 mt-6 px-6 py-2.5 rounded-xl neon-btn text-sm font-bold">
          <ChevronLeft size={16} /> {tCommon('back')}
        </Link>
      </div>
    );
  }

  const img = room.images?.[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/rooms" className="hover:text-neon-cyan flex items-center gap-1">
          <ChevronLeft size={14} /> {t('zones')}
        </Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left: info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hero */}
          <div className="neo-card rounded-2xl overflow-hidden">
            <div className="relative h-64 sm:h-80 bg-gradient-to-br from-cyber-800 to-cyber-950">
              <div className="absolute inset-0 grid-matrix opacity-40" />
              {img && <img src={img} alt={room.name} className="absolute inset-0 w-full h-full object-cover" />}
              <div className="absolute inset-0 bg-gradient-to-t from-cyber-950 via-transparent" />
              <div className="absolute bottom-4 left-5 right-5">
                <div className="flex flex-wrap gap-2 mb-2">
                  {room.zones?.slice(0, 4).map((z) => (
                    <span
                      key={z.id}
                      className={cn(
                        'px-2 py-1 text-[11px] font-bold rounded-lg border',
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
                <h1 className="text-2xl sm:text-4xl font-extrabold text-white drop-shadow-lg">{room.name}</h1>
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-300 mt-2">
                  <span className="flex items-center gap-1.5">
                    <MapPin size={14} className="text-neon-cyan" /> {room.address}
                  </span>
                  {room.phone && (
                    <a href={`tel:${room.phone}`} className="flex items-center gap-1.5 hover:text-neon-cyan">
                      <Phone size={14} className="text-neon-green" /> {room.phone}
                    </a>
                  )}
                  {room.workingHours && (
                    <span className="flex items-center gap-1.5">
                      <Clock size={14} className="text-neon-magenta" />
                      {room.workingHours.open} — {room.workingHours.close}
                    </span>
                  )}
                </div>
                {room.avgRating !== undefined && (
                  <div className="flex items-center gap-1.5 mt-2 text-sm">
                    <Star size={15} className="text-yellow-400 fill-yellow-400" />
                    <b className="text-white">{room.avgRating.toFixed(1)}</b>
                    <span className="text-gray-400">({room.ratingCount} {t('reviews')})</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* About */}
          {room.description && (
            <div className="neo-card rounded-2xl p-6">
              <h2 className="font-bold text-lg mb-2 flex items-center gap-2">
                <Rocket size={18} className="text-neon-cyan" /> {t('about')}
              </h2>
              <p className="text-gray-400 leading-relaxed whitespace-pre-line">{room.description}</p>
            </div>
          )}

          {/* Promotion dot */}
          <div className="neo-card rounded-2xl p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Users size={18} className="text-neon-magenta" /> {t('zones')} ({room.zones?.length || 0})
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {room.zones?.map((zone) => (
                <div key={zone.id} className="rounded-xl border border-neon-cyan/15 bg-cyber-800/60 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <b className="flex items-center gap-1.5">
                      {zone.type === 'VIP' ? <Sparkles size={14} className="text-neon-magenta" /> : <Monitor size={14} className="text-neon-cyan" />}
                      {zone.name}
                    </b>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-neon-cyan/10 text-neon-cyan font-semibold">
                      {formatPrice(zone.pricePerHour)} {t('perHour')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-2">
                    <span className="flex items-center gap-1"><Users size={12} /> {zone.capacity}</span>
                    {zone.computers && <span className="flex items-center gap-1"><Monitor size={12} /> {zone.computers.length} {t('computers')}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Computer specs preview */}
          {room.zones?.some((z) => z.computers?.length) && (
            <div className="neo-card rounded-2xl p-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Cpu size={18} className="text-neon-purple" /> {t('specsTitle')}
              </h2>
              {room.zones
                .filter((z) => z.computers?.length)
                .map((zone) => (
                  <div key={zone.id} className="mb-4 last:mb-0">
                    <p className="text-sm text-gray-400 mb-2">{zone.name}</p>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {zone.computers?.slice(0, 4).map((pc) => {
                        const specs = pc.specs || {};
                        const specsList = [
                          { icon: Cpu, label: t('cpu'), value: specs.cpu },
                          { icon: MemoryStick, label: t('ram'), value: specs.ram },
                          { icon: Video, label: t('gpu'), value: specs.gpu },
                        ].filter((s) => s.value);
                        return (
                          <div key={pc.id} className="rounded-lg border border-neon-cyan/10 bg-cyber-800/40 px-3 py-2 text-xs">
                            <b className="text-neon-cyan">{pc.name}</b>
                            <div className="grid gap-0.5 mt-1 text-gray-400">
                              {specsList.map((s, i) => (
                                <span key={i} className="flex items-center gap-1.5">
                                  <s.icon size={11} className="text-neon-purple" /> {s.label}: {s.value}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}

{/* Reviews */}
            <div className="neo-card rounded-2xl p-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                <MessageSquare size={18} className="text-neon-green" /> {t('reviews')} ({room.reviews?.length || 0})
              </h2>
              {room.reviews?.length ? (
                <div className="space-y-4">
                  {room.reviews.map((r) => (
                    <div key={r.id} className="rounded-xl border border-neon-cyan/10 bg-cyber-800/40 p-4">
                      <div className="flex items-center justify-between mb-1">
                        <b className="text-sm">{r.user?.fullName || 'User'}</b>
                        <span className="flex items-center gap-1 text-xs text-yellow-400">
                          <Star size={12} className="fill-yellow-400" /> {r.rating}
                        </span>
                      </div>
                      {r.comment && <p className="text-sm text-gray-400">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">{t('noReviews')}</p>
              )}
            </div>

            {/* Gaming Bar */}
            <BarOrdering roomId={room.id} />

            {/* Live Chat */}
            <ChatPanel roomId={room.id} roomName={room.name} />
          </div>

        {/* Right: booking widget */}
        <div className="lg:sticky lg:top-20 h-fit">
          <BookingWidget room={room} date={date} onDateChange={setDate} availability={availability} />
        </div>
      </div>

      {/* Quick stats bar */}
      <div className="mt-8 grid grid-cols-3 gap-4">
        {[
          { icon: Monitor, label: t('computers'), value: room.zones?.reduce((a, z) => a + (z.computers?.length || 0), 0) || 0 },
          { icon: ShieldCheck, label: 'Status', value: room.status },
          { icon: Users, label: 'Zona', value: room.zones?.length || 0 },
        ].map((s) => (
          <div key={s.label} className="neo-card rounded-2xl p-4 text-center">
            <s.icon size={20} className="mx-auto mb-1 text-neon-cyan" />
            <div className="text-lg font-bold">{s.value}</div>
            <div className="text-xs text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-gray-600 mt-6">
        © 2026 {room.name} · {formatDate(room.createdAt)}
      </p>
    </div>
  );
}