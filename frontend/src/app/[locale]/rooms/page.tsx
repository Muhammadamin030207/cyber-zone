'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Search, SlidersHorizontal, X, Building2, MapPin } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import type { Room } from '@/lib/types';
import RoomCard from '@/components/rooms/RoomCard';

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
  const [priceMin, setPriceMin] = useState(searchParams.get('min') || '');
  const [priceMax, setPriceMax] = useState(searchParams.get('max') || '');
  const [sort, setSort] = useState<SortKey>((searchParams.get('sort') as SortKey) || '');
  const [showFilters, setShowFilters] = useState(false);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (query) params.query = query;
      if (zoneType) params.type = zoneType;
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
  }, [query, zoneType, priceMin, priceMax, sort]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchRooms();
  }

  const hasFilters = zoneType || priceMin || priceMax || sort;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Building2 size={28} className="text-neon-cyan" />
          <h1 className="text-3xl font-extrabold tracking-tight">{tRooms('title')}</h1>
        </div>
        <p className="text-gray-400">{tRooms('subtitle')}</p>
      </div>

      {/* Search + Filter toggle */}
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 mb-4">
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
      </form>

      {/* Filter panel */}
      {showFilters && (
        <div className="neo-card rounded-2xl p-5 mb-6 animate-fade-up grid sm:grid-cols-4 gap-4 items-end">
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

          <div className="flex gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="glass-input flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
            >
              <option value="">{tRooms('sortNewest')}</option>
              <option value="price_asc">{tRooms('sortCheap')}</option>
            </select>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setZoneType('');
                  setPriceMin('');
                  setPriceMax('');
                  setSort('');
                }}
                className="px-3 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10"
                title="Clear"
              >
                <X size={16} />
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
          {[1, 2, 3].map((i) => (
            <div key={i} className="neo-card rounded-2xl h-80 animate-pulse" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-20">
          <MapPin size={48} className="mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 text-lg">{tRooms('empty')}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-4">{rooms.length} {tRooms('title').toLowerCase()}</p>
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