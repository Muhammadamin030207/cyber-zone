'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarCheck,
  CreditCard,
  MapPin,
  Monitor,
  Newspaper,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import api from '@/lib/api';
import type { Room } from '@/lib/types';

/**
 * Bosh sahifa qo'shimcha bo'limlari.
 *
 * Nima uchun kerak: bosh sahifada faqat `TopBanner` + `HeroZone` bor edi
 * (2 bo'lim). Bu — landing page uchun juda kam: foydalanuvchi narx, zona
 * va qanday ishlashini ko'rmaydi.
 *
 * QOIDA (bu komponentga tegishli): hech qanday son/raqam YASALMAYDI.
 * Har bir raqam quyidagicha keladi:
 *   - xona/zona soni  -> `GET /api/rooms` (backend `zones` ni `include` qilib
 *     qaytaradi — qo'shimcha so'rov kerak emas)
 *   - yangiliklar     -> `GET /api/news` (ma'muriy route `authenticate`siz)
 * Ma'lumot yuklanmasa yoki xato bo'lsa — bo'lim yashiriladi, "0" yoki
 * "lorem" ko'rsatilmaydi.
 */

interface NewsItem {
  id: string;
  title: string;
  content?: string | null;
  type?: string | null;
  image?: string | null;
  publishedAt?: string | null;
}

/** Soxta statistika yozmaslik uchun: hech narsa kelmasa `null` qaytadi. */
interface Facts {
  rooms: number | null;
  zones: number | null;
  computers: number | null;
  minPrice: number | null;
}

const STEPS = [
  {
    icon: Search,
    title: 'Xonani tanlang',
    body: 'Zona, ta’minot va bo‘sh kompyuterlarni ko‘rib, o‘zingizga mos xonani toping.',
  },
  {
    icon: CalendarCheck,
    title: 'Vaqtni band qiling',
    body: ' Sana va soatni tanlang. 1 soatlik oldindan to‘lov bilan joy band qilinadi.',
  },
  {
    icon: CreditCard,
    title: 'Kelib o‘ynang',
    body: 'QR orqali tizimga kiring. UNLIMITED kartada qo‘shimcha vaqt to‘lanmaydi.',
  },
] as const;

const TRUST = [
  { icon: ShieldCheck, label: 'Liveness bilan kirish' },
  { icon: CreditCard, label: 'Onlayn to‘lov' },
  { icon: Users, label: 'Jonli support' },
  { icon: Monitor, label: 'Zamonaviy qurilma' },
] as const;

function formatPrice(v: number): string {
  return new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 0 }).format(v);
}

export default function HomeSections() {
  const [facts, setFacts] = useState<Facts>({
    rooms: null,
    zones: null,
    computers: null,
    minPrice: null,
  });
  const [rooms, setRooms] = useState<Room[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    let alive = true;

    // Xonalar + statistika. `GET /api/rooms` allaqachon `zones` (va
    // `_count.computers`) ni qaytaradi — shuning uchun bitta so'rov yetarli.
    api
      .get('/api/rooms')
      .then(({ data }: { data: { data?: unknown; [k: string]: unknown } }) => {
        const rows = (data?.data ?? data) as Room[];
        if (!alive || !Array.isArray(rows) || rows.length === 0) return;

        const active = rows.filter((r) => r.status === 'ACTIVE');
        const zones = active.flatMap((r) => r.zones ?? []);
        const computers = zones.reduce(
          (sum, z) => sum + (z.computers?.length ?? 0),
          0,
        );
        const prices = zones
          .map((z) => Number(z.pricePerHour))
          .filter((n) => Number.isFinite(n) && n > 0);

        setRooms(active.slice(0, 3));
        setFacts({
          rooms: active.length,
          zones: zones.length,
          // Kompyuter soni `_count` da bo'lmasa `null` — yolg'oni ko'rsatmaymiz.
          computers:
            active.reduce((s, r) => s + (r._count?.computers ?? 0), 0) || null,
          minPrice: prices.length ? Math.min(...prices) : null,
        });
      })
      .catch(() => undefined);

    // Yangiliklar (ma'muriy route).
    api
      .get('/api/news')
      .then(({ data }: { data: { data?: unknown; [k: string]: unknown } }) => {
        const rows = (data?.data ?? data) as NewsItem[];
        if (alive && Array.isArray(rows)) setNews(rows.slice(0, 3));
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, []);

  const hasStats = facts.rooms !== null || facts.zones !== null;

  return (
    <div className="relative z-20 cz-shell pb-20 ">
      {/* ===== 1. RAQAMLAR (faqat real ma'lumot) ===== */}
      {hasStats && (
        <section
          aria-label="CYBER-ZONE haqida raqamlar"
          className="mb-16 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4"
        >
          {[
            { value: facts.rooms, label: 'Faol xona', icon: MapPin },
            { value: facts.zones, label: 'Zona', icon: Monitor },
            { value: facts.computers, label: 'Kompyuter', icon: Users },
            {
              value: facts.minPrice,
              label: 'soatidan',
              icon: CreditCard,
              prefix: true,
            },
          ]
            .filter((s) => s.value !== null)
            .map((s) => (
              <div
                key={s.label}
                className="surface min-w-0 rounded-2xl border border-white/10 p-4 text-center sm:p-5"
              >
                <s.icon
                  size={16}
                  className="mx-auto mb-2 text-[var(--acc-a)]"
                  aria-hidden="true"
                />
                <p className="font-bebas text-2xl leading-none tracking-wide text-[var(--fg)] sm:text-3xl">
                  {s.prefix ? `${formatPrice(s.value as number)} so‘m` : (s.value as number)}
                </p>
                <p className="mt-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--fg-dim)] sm:text-xs">
                  {s.prefix ? s.label : `${s.label} soni`}
                </p>
              </div>
            ))}
        </section>
      )}

      {/* ===== 2. QANDAY ISHLAYDI ===== */}
      <section aria-labelledby="cz-how" className="mb-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="cz-how"
            className="font-bebas text-3xl tracking-wide text-[var(--fg)] sm:text-4xl"
          >
            QANDAY ISHLAYDI
          </h2>
          <p className="mt-2 text-sm text-[var(--fg-mut)]">
            Uch qadam — va siz kompyuteringiz oldidasiz.
          </p>
        </div>

        <ol className="mt-8 grid gap-4 sm:gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="surface relative min-w-0 rounded-2xl border border-white/10 p-5 transition-colors hover:border-[color-mix(in_srgb,var(--acc-a)_45%,transparent)]"
            >
              <span
                aria-hidden
                className="font-bebas absolute right-4 top-3 text-4xl leading-none text-white/[0.06]"
              >
                {i + 1}
              </span>
              <s.icon
                size={22}
                className="text-[var(--acc-a)]"
                aria-hidden="true"
              />
              <h3 className="mt-3 text-base font-semibold text-[var(--fg)]">
                {s.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--fg-mut)]">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ===== 3. ZONALAR (real endpointdan) ===== */}
      {rooms.length > 0 && (
        <section aria-labelledby="cz-zones" className="mb-20">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="cz-zones"
                className="font-bebas text-3xl tracking-wide text-[var(--fg)] sm:text-4xl"
              >
                ZONALAR
              </h2>
              <p className="mt-1.5 text-sm text-[var(--fg-mut)]">
                Platformadagi faol xonalar va ularning zonalari.
              </p>
            </div>
            <Link
              href="/rooms"
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-[var(--fg-dim)] transition-colors hover:text-[var(--acc-a)]"
            >
              Barchasi <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>

          {/* `min-w-0` MUHIM: grid bolasi default `min-width: auto` bo'lgani
              uchun ichidagi eng uzun so'z (xona nomi/manzil) track'ni
              kengaytiradi va 320px ekranda gorizontal overflow chiqadi. */}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((r) => {
              const zoneNames = (r.zones ?? []).slice(0, 3);
              return (
                <li key={r.id} className="min-w-0">
                  <Link
                    href={`/rooms/${r.id}`}
                    className="group surface flex h-full min-w-0 flex-col rounded-2xl border border-white/10 p-5 transition-colors hover:border-[color-mix(in_srgb,var(--acc-a)_45%,transparent)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 break-words text-base font-semibold text-[var(--fg)]">
                        {r.name}
                      </h3>
                      {r.avgRating ? (
                        <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-[var(--acc-c)]">
                          ★ {r.avgRating.toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                    {r.district || r.address ? (
                      <p className="mt-1.5 flex items-center gap-1 text-xs text-[var(--fg-dim)]">
                        <MapPin size={11} aria-hidden="true" className="shrink-0" />
                        <span className="truncate">{r.district || r.address}</span>
                      </p>
                    ) : null}
                    {zoneNames.length > 0 ? (
                      <ul className="mt-3 flex flex-wrap gap-1.5">
                        {zoneNames.map((z) => (
                          <li
                            key={z.id}
                            className="min-w-0 break-words rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-[var(--fg-mut)]"
                          >
                            {z.name}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-[var(--acc-a)]">
                      Batafsil <ArrowRight size={12} aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ===== 4. YANGILIKLAR (real endpointdan) ===== */}
      {news.length > 0 && (
        <section aria-labelledby="cz-news" className="mb-20">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="cz-news"
                className="font-bebas text-3xl tracking-wide text-[var(--fg)] sm:text-4xl"
              >
                YANGILIKLAR
              </h2>
              <p className="mt-1.5 text-sm text-[var(--fg-mut)]">
                Aktsiyalar va e’lonlar.
              </p>
            </div>
            <Link
              href="/news"
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-[var(--fg-dim)] transition-colors hover:text-[var(--acc-a)]"
            >
              Barchasi <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {news.map((n) => (
              <li key={n.id} className="min-w-0">
                <Link
                  href="/news"
                  className="surface flex h-full min-w-0 flex-col rounded-2xl border border-white/10 p-5 transition-colors hover:border-[color-mix(in_srgb,var(--acc-a)_45%,transparent)]"
                >
                  <span className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--acc-c)_35%,transparent)] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-[var(--acc-c)]">
                    <Newspaper size={10} aria-hidden="true" className="shrink-0" />
                    <span className="truncate">{n.type || 'news'}</span>
                  </span>
                  <h3 className="mt-3 line-clamp-2 break-words text-base font-semibold text-[var(--fg)]">
                    {n.title}
                  </h3>
                  {n.publishedAt ? (
                    <time
                      dateTime={n.publishedAt}
                      className="mt-auto pt-3 text-[11px] text-[var(--fg-dim)]"
                    >
                      {new Date(n.publishedAt).toLocaleDateString('uz-UZ')}
                    </time>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ===== 5. ISHONCH + CTA ===== */}
      <section className="surface rounded-2xl border border-white/10 px-5 py-10 text-center sm:px-8">
        <ul className="mb-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {TRUST.map((t) => (
            <li
              key={t.label}
              className="flex items-center gap-2 text-xs text-[var(--fg-mut)] sm:text-sm"
            >
              <t.icon size={14} className="text-[var(--acc-a)]" aria-hidden="true" />
              {t.label}
            </li>
          ))}
        </ul>
        <p className="font-bebas mx-auto max-w-xl text-2xl leading-tight tracking-wide text-[var(--fg)] sm:text-3xl">
          HOZIR BRON QILING
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/rooms"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-[#04040f] transition-[filter] hover:brightness-110 sm:w-auto"
            style={{
              background:
                'linear-gradient(135deg, var(--acc-a-soft), var(--acc-a) 45%, var(--acc-b))',
            }}
          >
            Xonalarni ko‘rish <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link
            href="/location"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 surface px-6 py-3.5 text-sm font-semibold text-[var(--fg)] transition-colors hover:border-[var(--acc-a)] sm:w-auto"
          >
            <MapPin size={15} aria-hidden="true" /> Yaqin xonalar
          </Link>
        </div>
      </section>
    </div>
  );
}
