'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { Search, SlidersHorizontal, X, Building2, LayoutGrid, Map, ArrowUpDown } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import type { Room } from '@/lib/types';
import RoomCard from '@/components/rooms/RoomCard';
import Logo from '@/components/brand/Logo';
import { TASHKENT_DISTRICTS } from '@/lib/constants';

const RoomsMap = dynamic(() => import('@/components/rooms/RoomsMap'), { ssr: false });

type SortKey = '' | 'price_asc' | 'newest';
const ZONE_TYPES = ['GENERAL_HALL', 'VIP', 'CABIN'] as const;

export default function RoomsPage({ params }: { params: Promise<{ locale: string }> }) {
  void params;
  const t = useTranslations();
  const tRooms = useTranslations('rooms');
  const searchParams = useSearchParams();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [zoneType, setZoneType] = useState<string>(searchParams.get('type') || '');
  const [district, setDistrict] = useState<string>(searchParams.get('district') || '');
  const [priceMin, setPriceMin] = useState(searchParams.get('min') || '');
  const [priceMax, setPriceMax] = useState(searchParams.get('max') || '');
  const [sort, setSort] = useState<SortKey>((searchParams.get('sort') as SortKey) || '');
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (query) params.query = query;
      if (zoneType) params.type = zoneType;
      if (district) params.district = district;
      if (priceMin) params.price_min = priceMin;
      if (priceMax) params.price_max = priceMax;
      if (sort) params.sort = sort;

      const qs = new URLSearchParams(params).toString();
      const { data } = await api.get(`/api/rooms${qs ? `?${qs}` : ''}`);
      setRooms(data.data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [query, zoneType, district, priceMin, priceMax, sort]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchRooms();
  }

  const hasFilters = zoneType || district || priceMin || priceMax || sort;

  function clearAll() {
    setZoneType('');
    setDistrict('');
    setPriceMin('');
    setPriceMax('');
    setSort('');
    setQuery('');
  }

  const activeChips: string[] = [];
  if (zoneType) activeChips.push(zoneType === 'GENERAL_HALL' ? 'General' : zoneType);
  if (district) activeChips.push(district);
  if (priceMin) activeChips.push(`${priceMin} so‘mdan`);
  if (priceMax) activeChips.push(`gacha ${priceMax}`);
  if (sort === 'price_asc') activeChips.push('Arzon');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-xl border border-neon-cyan/30 bg-neon-cyan/10 flex items-center justify-center shadow-glow">
            <Building2 size={22} className="text-neon-cyan" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{tRooms('title')}</h1>
            <p className="text-gray-400">{tRooms('subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Search + toolbar */}
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="flex-1 flex items-center gap-2 px-3 glass rounded-xl neon-border">
          <Search size={18} className="text-neon-cyan shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tRooms('searchPlaceholder')}
            className="flex-1 bg-transparent outline-none py-2.5 text-sm placeholder:text-gray-500"
          />
        </div>
        <button type="submit" className="px-5 py-2.5 rounded-xl neon-btn text-sm font-semibold shrink-0">
          {t('common.viewAll')}
        </button>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
            showFilters || hasFilters
              ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan'
              : 'border-neon-cyan/15 bg-cyber-800 text-gray-400 hover:text-neon-cyan'
          }`}
        >
          <SlidersHorizontal size={16} /> Filters
          {hasFilters && <span className="w-2 h-2 rounded-full bg-neon-cyan" />}
        </button>
        <div className="flex rounded-xl border border-neon-cyan/15 overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setView('list')}
            aria-label="Ro'yxat ko'rinishi"
            aria-pressed={view === 'list'}
            data-tip="Ro'yxat"
            className={`px-3 py-2.5 flex items-center gap-1.5 text-sm font-medium transition-colors ${view === 'list' ? 'bg-neon-cyan/15 text-neon-cyan' : 'bg-cyber-800 text-gray-400 hover:text-neon-cyan'}`}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            type="button"
            onClick={() => setView('map')}
            aria-label="Xarita ko'rinishi"
            aria-pressed={view === 'map'}
            data-tip="Xarita"
            className={`px-3 py-2.5 flex items-center gap-1.5 text-sm font-medium transition-colors ${view === 'map' ? 'bg-neon-cyan/15 text-neon-cyan ring-1 ring-inset ring-neon-cyan/40' : 'bg-cyber-800 text-gray-400 hover:text-neon-cyan'}`}
          >
            <Map size={15} />
          </button>
        </div>
      </form>

      {/* Sort segmented */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-gray-500 flex items-center gap-1 uppercase tracking-wider">
          <ArrowUpDown size={12} /> Tartib:
        </span>
        {((['', 'price_asc'] as SortKey[])).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSort(s)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              sort === s
                ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan'
                : 'border-neon-cyan/15 text-gray-400 hover:text-neon-cyan'
            }`}
          >
            {s === '' ? tRooms('sortNewest') : tRooms('sortCheap')}
          </button>
        ))}

        {activeChips.length > 0 && (
          <>
            <div className="h-4 w-px bg-neon-cyan/20 mx-1" />
            {activeChips.map((chip, i) => (
              <span key={i} className="chip chip-success text-xs">{chip}</span>
            ))}
            <button onClick={clearAll} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 font-medium">
              <X size={12} /> Tozalash
            </button>
          </>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="neo-card rounded-2xl p-5 mb-6 animate-fade-up grid sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">{tRooms('filterDistrict')}</label>
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            >
              <option value="">{tRooms('allDistricts')}</option>
              {TASHKENT_DISTRICTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">{tRooms('filterType')}</label>
            <select
              value={zoneType}
              onChange={(e) => setZoneType(e.target.value)}
              className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            >
              <option value="">{tRooms('filterType')}</option>
              {ZONE_TYPES.map((zt) => (
                <option key={zt} value={zt}>
                  {zt === 'GENERAL_HALL' ? 'General' : zt === 'VIP' ? 'VIP' : 'Cabin'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">{tRooms('filterPriceMin')}</label>
            <input
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              placeholder="0"
              type="number"
              className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">{tRooms('filterPriceMax')}</label>
            <input
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              placeholder="100 000"
              type="number"
              className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            />
          </div>

          <div className="sm:col-span-4 flex justify-end">
            {hasFilters && (
              <button
                type="button"
                onClick={clearAll}
                className="px-4 py-2 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 flex items-center gap-1.5"
              >
                <X size={14} /> Hammasini tozalash
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {error && (
        <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton rounded-2xl h-80" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-20 neo-card rounded-2xl">
          <div className="w-16 h-16 mx-auto mb-4 neo-card rounded-2xl flex items-center justify-center animate-floaty">
            <Logo size={38} />
          </div>
          <p className="text-gray-400 text-lg max-w-md mx-auto">{tRooms('empty')}</p>
          <button
            onClick={clearAll}
            className="mt-5 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl neon-btn text-sm font-bold"
          >
            <X size={16} /> Filtrlarni tozalash
          </button>
        </div>
      ) : view === 'map' ? (
        <RoomsMap rooms={rooms} />
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-4">
            <b className="text-neon-cyan">{rooms.length}</b> {tRooms('title').toLowerCase()}
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}