'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  MapPin, Phone, Clock, Star, MessageSquare, Monitor, Cpu, MemoryStick, Video,
  ChevronLeft, Users, Rocket, ShieldCheck, Sparkles, Plus, X, Loader2,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import type { Room, AvailabilityZone } from '@/lib/types';
import { formatPrice, formatDate, todayISO, cn } from '@/lib/utils';
import BookingWidget from '@/components/booking/BookingWidget';
import BarOrdering from '@/components/bar/BarOrdering';
import Logo from '@/components/brand/Logo';
import { useAuthStore } from '@/store/auth';
import { getSocket } from '@/lib/socket';

const RoomMiniMap = dynamic(() => import('@/components/rooms/RoomsMap'), { ssr: false });

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
  const [availLoading, setAvailLoading] = useState(false);

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
    setAvailLoading(true);
    try {
      const { data } = await api.get(`/api/bookings/rooms/${roomId}/availability?date=${date}`);
      setAvailability(data.data.zones || []);
    } catch {
      setAvailability([]);
    } finally {
      setAvailLoading(false);
    }
  }, [roomId, date]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  useEffect(() => {
    if (roomId) fetchAvailability();
  }, [fetchAvailability, roomId]);

  // §5.15 — PC/xona holati statik emas: sahifa fokusga qaytganda va boshqa
  // foydalanuvchi bron qilganda (socket) mavjudlik backend'dan qayta olinadi.
  useEffect(() => {
    if (!roomId) return;
    const onFocus = () => fetchAvailability();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchAvailability();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    const socket = getSocket();
    const onBookingChanged = () => fetchAvailability();
    socket.on('booking_status_changed', onBookingChanged);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      socket.off('booking_status_changed', onBookingChanged);
    };
  }, [roomId, fetchAvailability]);

  const minPrice = useMemo(() => {
    if (!room?.zones?.length) return 0;
    return Math.min(...room.zones.map((z) => Number(z.pricePerHour)));
  }, [room]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="skeleton rounded-2xl h-72" />
          <div className="skeleton rounded-2xl h-48" />
        </div>
        <div className="skeleton rounded-2xl h-96" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center">
        <div className="w-20 h-20 neo-card rounded-3xl flex items-center justify-center mx-auto mb-5">
          <Logo size={44} />
        </div>
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
        <Link href="/rooms" className="chip hover:border-neon-cyan/40 hover:text-neon-cyan transition-colors">
          <ChevronLeft size={14} /> {t('zones')}
        </Link>
        <span className="text-gray-600">/</span>
        <span className="text-gray-400">{room.name}</span>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left: info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hero */}
          <div className="neo-card rounded-2xl overflow-hidden">
            <div className="relative h-64 sm:h-80 bg-gradient-to-br from-cyber-800 to-cyber-950">
              <div className="absolute inset-0 grid-matrix opacity-40" />
              <div className="absolute inset-0 bg-aurora" style={{ opacity: 0.35 }} />
              {img && <img src={img} alt={room.name} className="absolute inset-0 w-full h-full object-cover" />}
              <div className="absolute inset-0 bg-gradient-to-t from-cyber-950 via-cyber-950/40 to-transparent" />
              <div className="absolute top-4 left-5 right-5 flex items-start justify-between gap-2 flex-wrap">
                <span className="chip chip-success">{room.status === 'ACTIVE' ? 'Ochiq' : room.status === 'INACTIVE' ? 'Yopiq' : 'Kutilmoqda'}</span>
                {room.avgRating !== undefined && (
                  <span className="chip">
                    <Star size={13} className="text-yellow-400 fill-yellow-400" />
                    {room.avgRating.toFixed(1)}
                    <span className="text-gray-500">({room.ratingCount})</span>
                  </span>
                )}
              </div>
              <div className="absolute bottom-4 left-5 right-5">
                <div className="flex flex-wrap gap-2 mb-2">
                  {room.zones?.slice(0, 4).map((z) => (
                    <span
                      key={z.id}
                      className={cn(
                        'px-2 py-1 text-[11px] font-bold rounded-lg border backdrop-blur-sm',
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
                    <a href={`tel:${room.phone}`} className="flex items-center gap-1.5 hover:text-neon-cyan transition-colors">
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

          {/* Location map */}
          <div className="neo-card rounded-2xl overflow-hidden">
            <div className="px-6 pt-5 pb-3 flex items-center justify-between gap-2">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <MapPin size={18} className="text-neon-cyan" /> Joylashuv
              </h2>
              <span className="chip chip-warn">{room.address}</span>
            </div>
            <div className="px-6 pb-6">
              <RoomMiniMap rooms={[room]} height={280} />
            </div>
          </div>

          {/* Zones */}
          <div className="neo-card rounded-2xl p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Users size={18} className="text-neon-magenta" /> {t('zones')} ({room.zones?.length || 0})
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {room.zones?.map((zone) => (
                <div key={zone.id} className="card-hover rounded-xl border border-neon-cyan/15 bg-cyber-800/60 p-4 group">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <b className="flex items-center gap-1.5 text-sm sm:text-base">
                      <span className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                        zone.type === 'VIP' ? 'border-neon-magenta/30 bg-neon-magenta/10' : 'border-neon-cyan/30 bg-neon-cyan/10'
                      }`}>
                        {zone.type === 'VIP' ? <Sparkles size={14} className="text-neon-magenta" /> : <Monitor size={14} className="text-neon-cyan" />}
                      </span>
                      {zone.name}
                    </b>
                    <span className="text-xs px-2 py-1 rounded-lg bg-neon-cyan/10 text-neon-cyan font-bold shrink-0">
                      {formatPrice(zone.pricePerHour)} <span className="font-normal">{t('perHour')}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-3 pl-0">
                    <span className="chip"><Users size={12} /> {zone.capacity}</span>
                    {zone.computers && (
                      <span className="chip"><Monitor size={12} /> {zone.computers.length} {t('computers')}</span>
                    )}
                    <span className="chip chip-warn">{zone.type === 'VIP' ? 'MAX' : zone.type === 'CABIN' ? 'CABIN' : 'GENERAL'}</span>
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
                          <div key={pc.id} className="card-hover rounded-lg border border-neon-cyan/10 bg-cyber-800/40 px-3 py-2.5 text-xs">
                            <b className="text-neon-cyan">{pc.name}</b>
                            <div className="grid gap-1 mt-1.5 text-gray-400">
                              {specsList.map((s, i) => (
                                <span key={i} className="flex items-center gap-1.5">
                                  <span className="w-5 h-5 rounded-md border border-neon-purple/25 bg-neon-purple/10 flex items-center justify-center">
                                    <s.icon size={10} className="text-neon-purple" />
                                  </span> {s.label}: {s.value}
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
            <RoomReviews room={room} onRefresh={fetchRoom} />

            {/* Gaming Bar */}
            <BarOrdering roomId={room.id} />
          </div>

        {/* Right: booking widget */}
        <div className="lg:sticky lg:top-20 h-fit">
          <BookingWidget room={room} date={date} onDateChange={setDate} availability={availability} availabilityLoading={availLoading} />
        </div>
      </div>

      {/* Quick stats bar */}
      <div className="mt-8 grid grid-cols-3 gap-4">
        {[
          { icon: Monitor, label: t('computers'), value: room.zones?.reduce((a, z) => a + (z.computers?.length || 0), 0) || 0, color: 'text-neon-cyan border-neon-cyan/30 bg-neon-cyan/10' },
          { icon: ShieldCheck, label: 'Status', value: room.status === 'ACTIVE' ? 'Ochiq' : room.status === 'INACTIVE' ? 'Yopiq' : 'Kutilmoqda', color: 'text-neon-green border-neon-green/30 bg-neon-green/10' },
          { icon: Users, label: 'Zona', value: room.zones?.length || 0, color: 'text-neon-magenta border-neon-magenta/30 bg-neon-magenta/10' },
        ].map((s) => (
          <div key={s.label} className="neo-card rounded-2xl p-4 text-center flex flex-col items-center gap-1.5">
            <span className={`w-10 h-10 rounded-xl border flex items-center justify-center ${s.color}`}>
              <s.icon size={18} />
            </span>
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

function RoomReviews({ room, onRefresh }: { room: Room; onRefresh: () => void }) {
  const t = useTranslations('room');
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const canReview = !!user && user.role === 'USER';

  async function submit() {
    setSubmitting(true);
    setErr(null);
    setMsg(null);
    try {
      await api.post(`/api/rooms/${room.id}/reviews`, { rating, comment });
      setMsg('Rahmat! Izohingiz qo\'shildi.');
      setComment('');
      setOpen(false);
      onRefresh();
    } catch (e) {
      setErr(getApiErrorMessage(e, 'Izoh yuborishda xatolik'));
    }
    setSubmitting(false);
  }

  const myReview = room.reviews?.find((r) => r.userId === user?.id);

  return (
    <div className="neo-card rounded-2xl p-6">
      <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
        <MessageSquare size={18} className="text-neon-green" /> {t('reviews')} ({room.reviews?.length || 0})
      </h2>

      {canReview && (
        <div className="mb-5">
          {myReview && (
            <p className="text-xs text-gray-500 mb-2 flex items-center gap-1.5">
              <Star size={11} className="text-yellow-400 fill-yellow-400" /> Sizning bahoingiz: {myReview.rating} {myReview.comment ? `· "${myReview.comment}"` : ''}
            </p>
          )}
          {open ? (
            <div className="rounded-xl border border-neon-green/20 bg-cyber-800/50 p-4">
              <div className="flex items-center gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className="text-2xl transition-transform hover:scale-110"
                  >
                    <Star size={22} className={cn(n <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-600')} />
                  </button>
                ))}
                <span className="ml-2 text-sm font-bold">{rating}/5</span>
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Bu xona sizga qanday taassurot qoldirdi? (ixtiyoriy)"
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
              />
              {err && <p className="text-sm text-red-400 mt-2">{err}</p>}
              {msg && <p className="text-sm text-neon-green mt-2">{msg}</p>}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl neon-btn text-sm font-bold disabled:opacity-60"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Yuborish
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5"
                >
                  <X size={14} /> Bekor qilish
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-neon-green/30 text-neon-green text-sm font-bold hover:bg-neon-green/10"
            >
              <Star size={15} /> {myReview ? 'Izohni o\'zgartirish' : 'Izoh qoldirish'}
            </button>
          )}
        </div>
      )}

      {room.reviews?.length ? (
        <div className="space-y-3">
          {room.reviews.map((r) => (
            <div key={r.id} className="rounded-xl border border-neon-cyan/10 bg-cyber-800/40 p-4">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2.5">
                  <span className="avatar">{((r.user?.fullName || 'U')[0] || 'U').toUpperCase()}</span>
                  <b className="text-sm">{r.user?.fullName || 'User'}</b>
                </div>
                <span className="flex items-center gap-0.5 text-yellow-400 text-sm font-bold">
                  <Star size={13} className="fill-yellow-400" /> {r.rating}
                </span>
              </div>
              {r.comment && <p className="text-sm text-gray-400 pl-10">{r.comment}</p>}
              <p className="text-[10px] text-gray-600 pl-10 mt-1">
                {new Date(r.createdAt).toLocaleDateString('uz-UZ')}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">{t('noReviews')}</p>
      )}
    </div>
  );
}