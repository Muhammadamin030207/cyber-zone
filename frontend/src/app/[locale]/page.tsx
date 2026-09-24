'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Search, CalendarCheck, Crown, ShieldCheck, ArrowRight, MapPin } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import api from '@/lib/api';
import type { Room } from '@/lib/types';
import RoomCard from '@/components/rooms/RoomCard';
import HeroCountdownCard from '@/components/home/HeroCountdownCard';

const RoomsMap = dynamic(() => import('@/components/rooms/RoomsMap'), { ssr: false });

export default function HomePage() {
  const t = useTranslations('home');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/api/rooms')
      .then(({ data }) => setRooms(data.data))
      .catch(() => setRooms([]))
      .finally(() => setLoading(false));
  }, []);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(query ? `/rooms?q=${encodeURIComponent(query)}` : '/rooms');
  }

  const features = [
    { icon: CalendarCheck, title: t('features.book'), desc: t('features.bookDesc') },
    { icon: Crown, title: t('features.premium'), desc: t('features.premiumDesc') },
    { icon: ShieldCheck, title: t('features.secure'), desc: t('features.secureDesc') },
  ];

  const stats = [
    { value: `${rooms.length}+`, label: t('statsTitle') },
    { value: '24/7', label: 'Online bron' },
    { value: '3', label: 'Til' },
  ];

  return (
    <div>
      {/* ===== HERO ===== */}
      <HeroCountdownCard
        targetDate="2026-11-30T20:00:00.000Z"
        eventLabel="Cyber Tournament"
        eventTitle="NEXUS CUP"
        ctaHref="/rooms"
      />

      {/* ===== SEARCH ZONE ===== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-12 text-center">
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight mb-3">
          <span className="grad-text">{t('heroTitle')}</span>
        </h2>
        <p className="text-sm sm:text-base text-gray-400 max-w-2xl mx-auto mb-8">
          {t('heroSubtitle')}
        </p>

        {/* Search */}
        <form
          onSubmit={submitSearch}
          className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-2 p-1.5 sm:p-2 surface rounded-2xl"
        >
          <label className="flex-1 flex items-center gap-3 px-3 sm:px-4">
            <Search size={18} className="text-gray-400 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="flex-1 bg-transparent outline-none py-2.5 sm:py-3 text-sm placeholder:text-gray-500"
              aria-label={t('searchPlaceholder')}
            />
          </label>
          <button type="submit" className="sm:self-center px-5 py-2.5 sm:py-3 rounded-xl neon-btn text-sm">
            {t('searchBtn')}
          </button>
        </form>

        {/* Trust row */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-y-3">
          {stats.map((s, i) => (
            <div key={i} className="flex items-center gap-6 sm:gap-7 px-4 sm:px-6">
              <div className="text-center">
                <div className="text-lg sm:text-xl font-bold text-white">{s.value}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{s.label}</div>
              </div>
              {i < stats.length - 1 && (
                <span className="w-px h-8 bg-white/10" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ===== FEATURED ROOMS ===== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="flex items-end justify-between mb-6 sm:mb-8">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">{t('popularTitle')}</h2>
            <p className="text-gray-400 text-sm mt-1">{t('popularSubtitle')}</p>
          </div>
          <Link href="/rooms" className="flex items-center gap-1 text-neon-cyan text-sm group hover:gap-2 transition-all shrink-0">
            {tCommon('viewAll')} <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton rounded-2xl h-72" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {rooms.slice(0, 6).map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        )}
      </section>

      {/* ===== MAP ===== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="flex items-end justify-between mb-6 sm:mb-8">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight flex items-center gap-2">
              <MapPin size={20} className="text-neon-cyan" /> Xaritadagi klublar
            </h2>
            <p className="text-gray-400 text-sm mt-1">Toshkent bo&apos;ylab eng yaqin gaming zone&apos;ni toping</p>
          </div>
          <Link href="/rooms" className="flex items-center gap-1 text-neon-cyan text-sm group hover:gap-2 transition-all shrink-0">
            {tCommon('viewAll')} <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="surface rounded-2xl overflow-hidden p-1.5">
          <RoomsMap rooms={rooms} />
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-center mb-8">
          {t('featuresTitle')}
        </h2>
        <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
          {features.map((f) => (
            <div key={f.title} className="surface rounded-2xl p-6">
              <div className="w-11 h-11 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center mb-4">
                <f.icon size={22} className="text-neon-cyan" />
              </div>
              <h3 className="font-bold text-base mb-1.5">{f.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="rounded-2xl border border-white/10 bg-[color-mix(in_srgb,var(--bg-1)_85%,transparent)] p-8 sm:p-12 text-center">
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight mb-2">{t('ctaTitle')}</h2>
          <p className="text-gray-400 text-sm sm:text-base mb-6">{t('ctaSubtitle')}</p>
          <Link href="/login" className="inline-flex items-center gap-2 px-7 py-3 rounded-xl neon-btn text-sm">
            {t('ctaBtn')} <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}