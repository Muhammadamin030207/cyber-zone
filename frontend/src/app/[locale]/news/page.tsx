'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Newspaper, Megaphone, Image as ImageIcon, CalendarDays, Loader2, AlertCircle } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import type { NewsItem } from '@/lib/types';
import { formatDate, cn } from '@/lib/utils';

const TYPE_STYLE: Record<string, string> = {
  NEWS: 'border-neon-cyan/40 text-neon-cyan bg-neon-cyan/10',
  PROMOTION: 'border-neon-green/40 text-neon-green bg-neon-green/10',
  BANNER: 'border-neon-magenta/40 text-neon-magenta bg-neon-magenta/10',
};

export default function NewsPage({ params }: { params: Promise<{ locale: string }> }) {
  void params;
  const t = useTranslations('news');

  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<'ALL' | 'NEWS' | 'PROMOTION' | 'BANNER'>('ALL');

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/news');
      setNews(data.data || []);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const filtered = category === 'ALL' ? news : news.filter((n) => n.type === category);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-3 mb-2">
        <Newspaper size={28} className="text-neon-cyan" />
        <h1 className="text-3xl font-extrabold tracking-tight">{t('title')}</h1>
      </div>

      {/* Categories */}
      <div className="flex items-center gap-2 flex-wrap mb-8 mt-5">
        {(['ALL', 'NEWS', 'PROMOTION', 'BANNER'] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium border transition-colors',
              category === c
                ? 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan'
                : 'border-neon-cyan/15 text-gray-400 hover:text-neon-cyan'
            )}
          >
            {c === 'ALL' ? 'Hammasi' : t(c.toLowerCase())}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="neo-card rounded-2xl h-36 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Newspaper size={48} className="mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400">{t('noNews')}</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {filtered.map((item) => (
            <article key={item.id} className="neo-card rounded-2xl overflow-hidden flex flex-col">
              {item.imageUrl ? (
                <div className="relative h-44 bg-gradient-to-br from-cyber-800 to-cyber-950">
                  <img src={item.imageUrl} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-cyber-950 via-transparent" />
                </div>
              ) : (
                <div className="h-28 bg-gradient-to-br from-cyber-800 to-cyber-950 flex items-center justify-center">
                  <ImageIcon size={36} className="text-neon-cyan/30" />
                </div>
              )}
              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className={cn('px-2 py-1 text-[11px] font-bold rounded-lg border', TYPE_STYLE[item.type])}>
                    {t(item.type.toLowerCase())}
                  </span>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <CalendarDays size={11} /> {formatDate(item.publishedAt)}
                  </span>
                </div>
                <h2 className="font-bold text-lg mb-1 leading-tight">{item.title}</h2>
                {item.room && <p className="text-xs text-neon-cyan mb-2">{item.room.name}</p>}
                <p className="text-sm text-gray-400 flex-1 line-clamp-3">{item.content}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}