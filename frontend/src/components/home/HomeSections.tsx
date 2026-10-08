'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CalendarCheck,
  CreditCard,
  MapPin,
  Monitor,
  ScanFace,
  ShieldCheck,
  Star,
  Ticket,
  Zap,
  Users,
  Gauge,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import type { Room } from '@/lib/types';
import { TASHKENT_CENTER, resolveRoomCoords } from '@/lib/constants';
import { cn, formatPrice, formatPriceShort, todayISO, addDaysISO, zoneTypeLabel, toNumber } from '@/lib/utils';
import RoomsMap from '@/components/rooms/RoomsMap';

/**
 * Bosh sahifa bo'limlari (PREMIUM REDESIGN):
 *   1) QUICK BOOKING            — tez bron moduli (haqiqiy xona/zona ma'lumoti)
 *   2) YAQIN XONALAR            — geolokatsiya asosida masofa (horizontal scroll)
 *   3) ENG YAXSHI ZONALAR       — reyting bo'yicha (real API)
 *   4) XARITA                   — Leaflet xarita, filtrlash
 *   5) NEGA CYBER-ZONE          — 4 premium afzallik
 *   6) JONLI AKTIVLIK           — faqat real backend raqamlari
 *   7) AKSIYALAR                — faol promo-kodlar (bo'lmasa yashirinadi)
 *
 * QOIDA: hech qanday raqam YASALMAYDI. Har bir raqam `GET /api/rooms`,
 * `GET /api/promo/public` yoki brauzer geolokatsiyasidan keladi.
 */

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function minZonePrice(room: Room): number {
  const prices = (room.zones ?? []).map((z) => toNumber(z.pricePerHour)).filter((n) => n > 0);
  return prices.length ? Math.min(...prices) : NaN;
}

/** Xonadan birinchi mavjud kompyuter GPU/CPU spec'larini chiqaradi. */
function roomSpecs(room: Room): string[] {
  const out: string[] = [];
  for (const z of room.zones ?? []) {
    for (const c of z.computers ?? []) {
      const cpu = c.specs?.cpu;
      const gpu = c.specs?.gpu;
      if (typeof gpu === 'string' && gpu.trim()) out.push(gpu.trim());
      else if (typeof cpu === 'string' && cpu.trim()) out.push(cpu.trim());
      if (out.length >= 2) return out;
    }
  }
  return out;
}

function roomComputers(room: Room): number | null {
  const c = room._count?.computers;
  if (typeof c === 'number' && c > 0) return c;
  const sum = (room.zones ?? []).reduce((s, z) => s + (z.computers?.length ?? 0), 0);
  return sum > 0 ? sum : null;
}

interface Promo {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  minBookingAmount: number | null;
  expiresAt: string;
}

export default function HomeSections() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);

  // ---- Xonalar (real API) ----
  useEffect(() => {
    let alive = true;
    api
      .get('/api/rooms')
      .then(({ data }: { data: { data?: unknown; message?: string } }) => {
        const rows = data?.data ?? data;
        if (!alive) return;
        setRooms(Array.isArray(rows) ? rows.filter((r: Room) => r.status === 'ACTIVE') : []);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setRooms([]);
        setRoomsError(getApiErrorMessage(err) || 'Ma’lumot yuklanmadi.');
      });
    return () => {
      alive = false;
    };
  }, []);

  // ---- Faol promo-kodlar (real backend) — bo'lmasa bo'lim yashirinadi ----
  useEffect(() => {
    let alive = true;
    api
      .get('/api/promo/public')
      .then(({ data }: { data: { data?: unknown } }) => {
        if (!alive) return;
        const rows = data?.data;
        if (Array.isArray(rows)) setPromos(rows as Promo[]);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // ---- Geolokatsiya: "yaqin xonalar" uchun real masofa ----
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoDenied(true),
      { timeout: 8000, maximumAge: 120000 },
    );
  }, []);

  const distanceOf = (room: Room): number => {
    const c = resolveRoomCoords(room);
    const base = myPos ?? TASHKENT_CENTER;
    return haversineKm(base, c);
  };

  const nearest = useMemo(
    () => (rooms && rooms.length > 0 ? [...rooms].sort((a, b) => distanceOf(a) - distanceOf(b)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rooms, myPos, geoDenied],
  );

  const best = useMemo(
    () => (rooms && rooms.length > 0 ? [...rooms].sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0)).slice(0, 3) : []),
    [rooms],
  );

  const [mapFilter, setMapFilter] = useState<'nearest' | 'best' | 'all'>('all');
  const mapRooms = rooms ?? [];
  const filteredForMap = useMemo(() => {
    if (mapFilter === 'nearest') return [...mapRooms].sort((a, b) => distanceOf(a) - distanceOf(b));
    if (mapFilter === 'best') return [...mapRooms].sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0));
    return mapRooms;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRooms, mapFilter, myPos]);

  // ---- QUICK BOOKING state ----
  const [qbRoomId, setQbRoomId] = useState<string | null>(null);
  const [qbDate, setQbDate] = useState(() => todayISO());
  const [qbTime, setQbTime] = useState('14:00');
  const [qbHours, setQbHours] = useState(1);

  const qbRooms = useMemo(() => rooms ?? [], [rooms]);
  const effectiveQbRoomId = qbRoomId ?? qbRooms[0]?.id ?? '';

  const HOURS = useMemo(() => {
    const arr: string[] = [];
    for (let h = 9; h <= 23; h += 1) arr.push(`${String(h).padStart(2, '0')}:00`);
    return arr;
  }, []);

  const goBook = () => {
    if (!effectiveQbRoomId) return;
    router.push(`/rooms/${effectiveQbRoomId}`);
  };

  // ---- Haqiqiy agregat statistika (faqat real) ----
  const zonesCount = (rooms ?? []).reduce((s, r) => s + (r.zones?.length ?? 0), 0);
  const computersCount = (rooms ?? []).reduce((s, r) => s + (roomComputers(r) ?? 0), 0);

  const distanceLabel = (room: Room): string => {
    const d = distanceOf(room);
    if (d >= 100) return 'Toshkent';
    return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
  };

  const sectionTitle = (id: string, title: string, sub: string) => (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="font-bebas text-3xl tracking-wide text-[var(--fg)] sm:text-4xl">
          {title}
        </h2>
        <p className="mt-1.5 text-sm text-[var(--fg-mut)]">{sub}</p>
      </div>
      <Link
        href="/rooms"
        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-[var(--fg-dim)] transition-colors hover:text-[var(--acc-a)]"
      >
        Barchasi <ArrowRight size={13} aria-hidden="true" />
      </Link>
    </div>
  );

  return (
    <div className="relative z-20 cz-shell pb-20">
      {/* ===== 1. TEZ BRON (QUICK BOOKING) ===== */}
      {qbRooms.length > 0 && (
        <section aria-labelledby="cz-quick" className="mb-20">
          <div
            className="surface rounded-2xl border border-white/10 p-5 sm:p-6"
            style={{ boxShadow: '0 18px 60px -30px color-mix(in srgb, var(--acc-a) 40%, transparent)' }}
          >
            <div className="mb-5 flex items-center gap-2.5">
              <span className="cz-icon-btn !w-8 !h-8 !min-w-8 text-[var(--acc-a)]" aria-hidden>
                <CalendarClock size={15} />
              </span>
              <div>
                <h2 id="cz-quick" className="font-bebas text-2xl tracking-wide text-[var(--fg)]">
                  TEZ BRON
                </h2>
                <p className="text-xs text-[var(--fg-mut)]">Zona, sana va vaqtni tanlang — bronni biz hal qilamiz.</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {/* Xona */}
              <label className="block min-w-0 lg:col-span-2">
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-[var(--fg-dim)]">Xona / zona</span>
                <select
                  value={effectiveQbRoomId}
                  onChange={(e) => setQbRoomId(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[var(--bg-2)] px-3 py-2.5 text-sm text-[var(--fg)] outline-none transition-colors focus:border-[var(--acc-a)]"
                >
                  {qbRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Sana */}
              <fieldset>
                <legend className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-[var(--fg-dim)]">Sana</legend>
                <div className="flex gap-1.5">
                  {([
                    { label: 'Bugun', value: todayISO() },
                    { label: 'Ertaga', value: addDaysISO(1) },
                  ] as const).map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setQbDate(d.value)}
                      aria-pressed={qbDate === d.value}
                      className={cn(
                        'flex-1 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors',
                        qbDate === d.value
                          ? 'border-[var(--acc-a)] text-[var(--acc-a)]'
                          : 'border-white/10 text-[var(--fg-mut)] hover:border-white/20'
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Vaqt */}
              <label className="block min-w-0">
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-[var(--fg-dim)]">Vaqt</span>
                <select
                  value={qbTime}
                  onChange={(e) => setQbTime(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[var(--bg-2)] px-3 py-2.5 text-sm text-[var(--fg)] outline-none transition-colors focus:border-[var(--acc-a)]"
                >
                  {HOURS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>

              {/* Davomiylik */}
              <label className="block min-w-0">
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-[var(--fg-dim)]">Davomiylik</span>
                <select
                  value={qbHours}
                  onChange={(e) => setQbHours(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-[var(--bg-2)] px-3 py-2.5 text-sm text-[var(--fg)] outline-none transition-colors focus:border-[var(--acc-a)]"
                >
                  {[1, 2, 3, 4, 5, 6].map((h) => (
                    <option key={h} value={h}>
                      {h} soat
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              onClick={goBook}
              className="cz-btn cz-btn--cta mt-5 w-full"
              style={{ minHeight: 48 }}
            >
              DAVOM ETISH <ArrowRight size={17} aria-hidden="true" />
            </button>
            <p className="mt-2 text-[11px] text-[var(--fg-dim)]">
              {effectiveQbRoomId
                ? `${qbDate.replaceAll('-', '.')} · ${qbTime} · ${qbHours} soat — narxni tanlangan xonada ko'rasiz`
                : 'Xonani tanlang'}
            </p>
          </div>
        </section>
      )}

      {/* Load / error umumiy holatlari */}
      {rooms === null && (
        <div className="mb-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Yuklanmoqda">
          {[0, 1, 2].map((i) => (
            <div key={i} className="surface min-h-48 animate-pulse rounded-2xl border border-white/10 p-5">
              <div className="h-4 w-32 rounded bg-white/10" />
              <div className="mt-4 h-3 w-24 rounded bg-white/10" />
              <div className="mt-6 h-9 w-full rounded-xl bg-white/10" />
            </div>
          ))}
        </div>
      )}

      {roomsError && rooms !== null && rooms.length === 0 && (
        <section className="surface mb-20 rounded-2xl border border-white/10 px-5 py-10 text-center" role="alert">
          <p className="text-sm text-[var(--fg-mut)]">{roomsError}</p>
          <Link href="/rooms" className="cz-btn cz-btn--primary mt-5">
            Xonalarni ko‘rish <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      )}

      {/* ===== 2. YAQIN XONALAR (real masofa, horizontal scroll) ===== */}
      {nearest.length > 0 && (
        <section aria-labelledby="cz-near" className="mb-20">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 id="cz-near" className="font-bebas text-3xl tracking-wide text-[var(--fg)] sm:text-4xl">
                YAQIN XONALAR
              </h2>
              <p className="mt-1.5 text-sm text-[var(--fg-mut)]">
                {myPos
                  ? 'Sizga eng yaqin xonalar — masofa geolokatsiya bo‘yicha.'
                  : geoDenied
                    ? 'Masofa Toshkent markazidan hisoblandi (geolokatsiya rad etildi).'
                    : 'Masofani hisoblash uchun joylashuv so‘ralmoqda…'}
              </p>
            </div>
            <Link
              href="/location"
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-[var(--fg-dim)] transition-colors hover:text-[var(--acc-a)]"
            >
              Xaritada <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>

          <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {nearest.map((r) => {
              const price = minZonePrice(r);
              const specs = roomSpecs(r);
              const comps = roomComputers(r);
              return (
                <li key={r.id} className="min-w-[82%] snap-start sm:min-w-0">
                  <Link
                    href={`/rooms/${r.id}`}
                    className="group surface flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 transition-all hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--acc-a)_45%,transparent)]"
                  >
                    {r.images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.images[0]}
                        alt={r.name}
                        className="aspect-[16/9] w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid aspect-[16/9] w-full place-items-center bg-gradient-to-br from-white/[0.04] to-white/[0.01]">
                        <Monitor size={28} className="text-[var(--acc-a)]" aria-hidden="true" />
                      </div>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="min-w-0 break-words text-base font-semibold text-[var(--fg)]">
                          {r.name}
                        </h3>
                        {r.avgRating ? (
                          <span className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-[var(--acc-c)]">
                            <Star size={10} aria-hidden="true" className="fill-current" />
                            {r.avgRating.toFixed(1)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--fg-dim)]">
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={11} aria-hidden="true" className="shrink-0" />
                          <span className="truncate">{r.district || r.address}</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Gauge size={11} aria-hidden="true" className="shrink-0" />
                          {distanceLabel(r)}
                        </span>
                      </p>
                      {specs.length > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-1.5">
                          {specs.map((s) => (
                            <li
                              key={s}
                              className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-[var(--fg-mut)]"
                            >
                              {s}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-auto flex items-end justify-between gap-2 pt-4">
                        <div className="min-w-0">
                          {Number.isFinite(price) ? (
                            <p className="text-sm text-[var(--fg)]">
                              <b className="font-bebas text-xl tracking-wide text-[var(--acc-a)]">{formatPriceShort(price)}</b>{' '}
                              so‘m/s
                            </p>
                          ) : null}
                          {comps !== null && (
                            <p className="text-[11px] text-[var(--fg-dim)]">{comps} ta kompyuter</p>
                          )}
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-[var(--acc-a)]">
                          Bron qilish <ArrowRight size={12} aria-hidden="true" />
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ===== 3. ENG YAXSHI ZONALAR (real reyting) ===== */}
      {best.length > 0 && (
        <section aria-labelledby="cz-best" className="mb-20">
          {sectionTitle(
            'cz-best',
            'ENG YAXSHI ZONALAR',
            'Eng yuqori baholangan xonalar — haqiqiy foydalanuvchi reytingi.',
          )}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {best.map((r) => {
              const price = minZonePrice(r);
              const zoneNames = (r.zones ?? []).slice(0, 3);
              return (
                <li key={r.id} className="min-w-0">
                  <Link
                    href={`/rooms/${r.id}`}
                    className="group surface flex h-full min-w-0 flex-col rounded-2xl border border-white/10 p-5 transition-all hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--acc-a)_45%,transparent)]"
                    style={{ boxShadow: '0 14px 40px -28px color-mix(in srgb, var(--acc-c) 55%, transparent)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 break-words text-base font-semibold text-[var(--fg)]">{r.name}</h3>
                      {r.avgRating ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-[var(--acc-c)]">
                          <Star size={10} aria-hidden="true" className="fill-current" />
                          {r.avgRating.toFixed(1)}
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
                            {zoneTypeLabel(z.type)} · {z.name}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-auto flex items-end justify-between gap-2 pt-4">
                      {Number.isFinite(price) ? (
                        <p className="text-sm text-[var(--fg)]">
                          <b className="font-bebas text-2xl tracking-wide text-[var(--acc-a)]">{formatPriceShort(price)}</b>{' '}
                          so‘m / soat
                        </p>
                      ) : (
                        <span />
                      )}
                      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-[var(--acc-a)]">
                        Batafsil <ArrowRight size={12} aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ===== 4. XARITA ===== */}
      {mapRooms.length > 0 && (
        <section aria-labelledby="cz-map" className="mb-20">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="cz-map" className="font-bebas text-3xl tracking-wide text-[var(--fg)] sm:text-4xl">
                XARITA
              </h2>
              <p className="mt-1.5 text-sm text-[var(--fg-mut)]">
                Xonalarni xaritada ko‘ring — marker bosilganda bronga o‘tish.
              </p>
            </div>
            <div className="flex gap-1.5" role="group" aria-label="Xarita filtri">
              {([
                { k: 'all', label: 'Barchasi' },
                { k: 'nearest', label: 'Eng yaqin' },
                { k: 'best', label: 'Eng yaxshi' },
              ] as const).map((f) => (
                <button
                  key={f.k}
                  type="button"
                  onClick={() => setMapFilter(f.k)}
                  aria-pressed={mapFilter === f.k}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    mapFilter === f.k
                      ? 'border-[var(--acc-a)] text-[var(--acc-a)]'
                      : 'border-white/10 text-[var(--fg-mut)] hover:border-white/20'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <RoomsMap rooms={filteredForMap} height={420} />
          </div>
        </section>
      )}

      {/* ===== 5. NEGA CYBER-ZONE ===== */}
      <section aria-labelledby="cz-why" className="mb-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="cz-why" className="font-bebas text-3xl tracking-wide text-[var(--fg)] sm:text-4xl">
            NEGA CYBER-ZONE
          </h2>
          <p className="mt-2 text-sm text-[var(--fg-mut)]">O‘yinga tayyor platforma — qog‘ozsiz va navbatsiz.</p>
        </div>

        <ul className="mt-8 grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Zap,
              title: 'Tezkor bron',
              body: 'Bir necha soniyada joy band qiling — xona, zona, sana va vaqtni o‘zingiz tanlaysiz.',
            },
            {
              icon: Monitor,
              title: 'Jiddiy gaming setup',
              body: 'Har bir xona o‘z zonalari va qurilmalari bilan — real specs to‘g‘ridan-to‘g‘ri kartada.',
            },
            {
              icon: ShieldCheck,
              title: 'Xavfsiz sessiya',
              body: 'Sessiya boshlashdan oldin kamera orqali o‘zligingizni tasdiqlaysiz.',
            },
            {
              icon: CreditCard,
              title: 'Online to‘lov',
              body: 'Click, Payme, Uzum, Paynet va karta o‘tkazmalari — turli usullar bir joyda.',
            },
          ].map((b) => (
            <li
              key={b.title}
              className="surface relative min-w-0 rounded-2xl border border-white/10 p-5 transition-colors hover:border-[color-mix(in_srgb,var(--acc-a)_45%,transparent)]"
            >
              <span className="cz-icon-btn !w-9 !h-9 !min-w-9 text-[var(--acc-a)]" aria-hidden>
                <b.icon size={17} />
              </span>
              <h3 className="mt-3.5 text-base font-semibold text-[var(--fg)]">{b.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--fg-mut)]">{b.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ===== 6. JONLI AKTIVLIK (faqat real backend raqamlari) ===== */}
      {rooms !== null && rooms.length > 0 && (
        <section aria-labelledby="cz-live" className="mb-20">
          <div className="surface rounded-2xl border border-white/10 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="cz-live" className="font-bebas text-2xl tracking-wide text-[var(--fg)]">
                JONLI AKTIVLIK
              </h2>
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-[var(--fg-dim)]">
                <span aria-hidden className="cz-dot animate-pulse" />
                Real backend ma’lumotlari
              </p>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3">
              {[
                { value: rooms.length, label: 'faol xona', icon: MapPin },
                { value: zonesCount, label: 'zona', icon: Users },
                { value: computersCount, label: 'kompyuter', icon: Monitor },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <s.icon size={15} className="mx-auto mb-1.5 text-[var(--acc-a)]" aria-hidden="true" />
                  <dd className="font-bebas text-2xl leading-none tracking-wide text-[var(--fg)] sm:text-3xl">
                    {s.value || 0}
                  </dd>
                  <dt className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--fg-dim)] sm:text-xs">
                    {s.label}
                  </dt>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      {/* ===== 7. AKSIYALAR (real promo-kodlar; bo'lsa ko'rsatiladi) ===== */}
      {promos.length > 0 && (
        <section aria-labelledby="cz-promo" className="mb-20">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="cz-promo" className="font-bebas text-3xl tracking-wide text-[var(--fg)] sm:text-4xl">
                AKSIYALAR
              </h2>
              <p className="mt-1.5 text-sm text-[var(--fg-mut)]">Bron paytida faol promo-kodlar.</p>
            </div>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {promos.map((p) => (
              <li key={p.id} className="min-w-0">
                <div className="surface flex h-full min-w-0 flex-col rounded-2xl border border-white/10 p-5">
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--acc-a)_40%,transparent)] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-[var(--acc-a)]">
                    <Ticket size={10} aria-hidden="true" className="shrink-0" />
                    Faol kod
                  </span>
                  <code className="mt-3 font-mono text-lg tracking-widest text-[var(--fg)]">{p.code}</code>
                  <p className="mt-2 text-sm text-[var(--fg-mut)]">
                    {p.discountType === 'PERCENTAGE' ? `${p.discountValue}% chegirma` : `${formatPrice(p.discountValue)} so‘m chegirma`}
                    {p.minBookingAmount ? ` · minimal ${formatPrice(p.minBookingAmount)}` : ''}
                  </p>
                  <p className="mt-auto pt-3 text-[11px] text-[var(--fg-dim)]">
                    Amal qilish muddati: {new Date(p.expiresAt).toLocaleDateString('uz-UZ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ===== FINAL CTA ===== */}
      <section className="surface rounded-2xl border border-white/10 px-5 py-10 text-center sm:px-8" aria-labelledby="cz-cta">
        <ul className="mb-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {[
            { icon: Zap, label: 'Real-time bron' },
            { icon: ScanFace, label: 'Kamera bilan kirish' },
            { icon: CreditCard, label: 'Onlayn to‘lov' },
            { icon: CalendarCheck, label: 'Navbatsiz sessiya' },
          ].map((t) => (
            <li key={t.label} className="flex items-center gap-2 text-xs text-[var(--fg-mut)] sm:text-sm">
              <t.icon size={14} className="text-[var(--acc-a)]" aria-hidden="true" />
              {t.label}
            </li>
          ))}
        </ul>
        <p id="cz-cta" className="font-bebas mx-auto max-w-xl text-2xl leading-tight tracking-wide text-[var(--fg)] sm:text-3xl">
          HOZIR BRON QILING
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/rooms" className="cz-btn cz-btn--cta cz-btn--block-mobile">
            Xonalarni ko‘rish <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/location" className="cz-btn cz-btn--secondary cz-btn--block-mobile">
            <MapPin size={15} aria-hidden="true" /> Yaqin xonalar
          </Link>
        </div>
      </section>
    </div>
  );
}