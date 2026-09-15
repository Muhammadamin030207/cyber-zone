'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Search, CalendarCheck, Crown, ShieldCheck, ArrowRight, Users, Building2, CalendarDays, Zap } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import api from '@/lib/api';
import type { Room } from '@/lib/types';
import RoomCard from '@/components/rooms/RoomCard';

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
    { icon: CalendarCheck, title: t('features.book'), desc: t('features.bookDesc'), color: 'text-neon-cyan bg-neon-cyan/10 border-neon-cyan/30' },
    { icon: Crown, title: t('features.premium'), desc: t('features.premiumDesc'), color: 'text-neon-magenta bg-neon-magenta/10 border-neon-magenta/30' },
    { icon: ShieldCheck, title: t('features.secure'), desc: t('features.secureDesc'), color: 'text-neon-green bg-neon-green/10 border-neon-green/30' },
  ];

  return (
    <div>
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,212,255,0.12),transparent_60%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-neon-cyan/30 bg-neon-cyan/5 text-xs text-neon-cyan">
            <Zap size={14} />
            <span className="uppercase tracking-wider font-semibold">Next-gen Gaming Platform</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-4 animate-fade-up">
            <span className="neon-text">{t('heroTitle')}</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 animate-fade-up">
            {t('heroSubtitle')}
          </p>

          {/* Search */}
          <form onSubmit={submitSearch} className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-2 p-2 glass rounded-2xl neon-border">
            <div className="flex-1 flex items-center gap-2 px-3">
              <Search size={18} className="text-neon-cyan shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="flex-1 bg-transparent outline-none py-2 text-sm placeholder:text-gray-500"
              />
            </div>
            <button type="submit" className="px-6 py-2.5 rounded-xl neon-btn text-sm">
              {t('searchBtn')}
            </button>
          </form>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-3 gap-4 max-w-lg mx-auto">
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold neon-text">{rooms.length}+</div>
              <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{t('statsTitle')} xona</div>
            </div>
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-neon-green">24/7</div>
              <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Online bron</div>
            </div>
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-neon-magenta">3+</div>
              <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Til</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURED ROOMS ===== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{t('popularTitle')}</h2>
            <p className="text-gray-400 mt-1">{t('popularSubtitle')}</p>
          </div>
          <Link href="/rooms" className="hidden sm:flex items-center gap-1 text-neon-cyan text-sm hover:underline">
            {tCommon('viewAll')} <ArrowRight size={16} />
          </Link>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="neo-card rounded-2xl h-80 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {rooms.slice(0, 6).map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        )}
      </section>

      {/* ===== FEATURES ===== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-center mb-10">{t('featuresTitle')}</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="neo-card rounded-2xl p-6 text-center">
              <div className={`w-14 h-14 mx-auto rounded-2xl border flex items-center justify-center mb-4 ${f.color}`}>
                <f.icon size={26} />
              </div>
              <h3 className="font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="rounded-3xl overflow-hidden relative p-8 sm:p-12 text-center glass">
          <div className="absolute inset-0 grid-matrix opacity-40" />
          <div className="relative">
            <Users size={48} className="mx-auto mb-4 text-neon-cyan animate-float" />
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">{t('ctaTitle')}</h2>
            <p className="text-gray-400 mb-6">{t('ctaSubtitle')}</p>
            <Link href="/register" className="inline-flex items-center gap-2 px-8 py-3 rounded-xl neon-btn">
              {t('ctaBtn')} <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}