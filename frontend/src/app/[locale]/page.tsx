'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Search, CalendarCheck, Crown, ShieldCheck, ArrowRight, Users, Building2, Clock3, Languages, Sparkles, MapPin } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import api from '@/lib/api';
import type { Room } from '@/lib/types';
import RoomCard from '@/components/rooms/RoomCard';
import Logo from '@/components/brand/Logo';

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
    { icon: Building2, value: `${rooms.length}+`, label: t('statsTitle') },
    { icon: Clock3, value: '24/7', label: 'Online bron' },
    { icon: Languages, value: '3', label: 'Til' },
  ];

  return (
    <div>
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-aurora" />
        <div className="absolute inset-0 grid-matrix opacity-30" />
        <div className="orb w-72 h-72 bg-neon-cyan/20 top-4 -left-16 animate-floaty" />
        <div className="orb w-80 h-80 bg-neon-magenta/15 right-0 top-24 animate-floaty" style={{ animationDelay: '1.6s' }} />
        <div className="orb w-64 h-64 bg-neon-purple/15 -bottom-10 left-1/3 animate-floaty" style={{ animationDelay: '3s' }} />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center relative">
          <div className="flex justify-center mb-6 animate-fade-up">
            <div className="relative p-3 rounded-3xl glass border border-white/10 shadow-glow">
              <Logo size={72} />
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 rounded-full border border-neon-cyan/30 bg-neon-cyan/5 text-xs text-neon-cyan shadow-glow">
            <Sparkles size={14} />
            <span className="uppercase tracking-wider font-semibold">Next-gen Gaming Platform</span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-4 animate-fade-up">
            <span className="grad-text">{t('heroTitle')}</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 animate-fade-up">
            {t('heroSubtitle')}
          </p>

          {/* Search */}
          <form onSubmit={submitSearch} className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-2 p-2 glass rounded-2xl neon-border shadow-glow">
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
          <div className="mt-12 grid grid-cols-3 gap-3 sm:gap-4 max-w-2xl mx-auto">
            {stats.map((s, i) => (
              <div
                key={i}
                className="glass rounded-2xl px-3 py-4 flex flex-col sm:flex-row sm:items-center justify-center gap-2 sm:gap-3 animate-fade-up"
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <s.icon size={22} className="text-neon-cyan shrink-0 mx-auto sm:mx-0" />
                <div className="text-center sm:text-left">
                  <div className="text-xl sm:text-2xl font-bold grad-text">{s.value}</div>
                  <div className="text-[11px] text-gray-500 uppercase tracking-wider">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURED ROOMS ===== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-neon-cyan uppercase tracking-widest mb-1">
              <Sparkles size={14} /> {tCommon('viewAll')}
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{t('popularTitle')}</h2>
            <p className="text-gray-400 mt-1">{t('popularSubtitle')}</p>
          </div>
          <Link href="/rooms" className="flex items-center gap-1 text-neon-cyan text-sm hover:gap-2 transition-all group">
            {tCommon('viewAll')} <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton rounded-2xl h-80" />
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

      {/* ===== MAP ===== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-neon-cyan uppercase tracking-widest mb-1">
              <MapPin size={14} /> Xarita
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Xaritadagi klublar</h2>
            <p className="text-gray-400 mt-1">Toshkent bo&apos;ylab eng yaqin gaming zone&apos;ni toping</p>
          </div>
          <Link href="/rooms" className="flex items-center gap-1 text-neon-cyan text-sm hover:gap-2 transition-all group">
            {tCommon('viewAll')} <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
        <div className="animate-fade-up">
          <RoomsMap rooms={rooms} />
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-center mb-10">
          <span className="grad-text">{t('featuresTitle')}</span>
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="neo-card card-topline card-hover rounded-2xl p-6 text-center"
            >
              <div className="w-14 h-14 mx-auto rounded-2xl border border-neon-cyan/30 bg-neon-cyan/10 flex items-center justify-center mb-4 shadow-glow">
                <f.icon size={26} className="text-neon-cyan" />
              </div>
              <h3 className="font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="rounded-3xl overflow-hidden relative p-8 sm:p-12 text-center glass animate-glow">
          <div className="absolute inset-0 grid-matrix opacity-40" />
          <div className="absolute inset-0 bg-aurora" style={{ opacity: 0.6 }} />
          <div className="relative">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl border border-neon-cyan/30 bg-neon-cyan/10 flex items-center justify-center animate-floaty">
              <Users size={30} className="text-neon-cyan" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">{t('ctaTitle')}</h2>
            <p className="text-gray-400 mb-6">{t('ctaSubtitle')}</p>
            <Link href="/login" className="inline-flex items-center gap-2 px-8 py-3 rounded-xl neon-btn">
              {t('ctaBtn')} <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}