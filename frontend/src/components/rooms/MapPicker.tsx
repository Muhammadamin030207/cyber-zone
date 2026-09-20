'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, LocateFixed, Search, Loader2, Navigation } from 'lucide-react';
import { TASHKENT_CENTER, DISTRICT_COORDS } from '@/lib/constants';

interface GeoResult {
  lat: number;
  lng: number;
  label: string;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';

/**
 * Interaktiv joy tanlagich — super_admin xona yaratishda ishlatiladi.
 * - Xaritaga bosing -> marker + avtomatik manzil (reverse geocode)
 * - "Mening joylashuvim" -> brauzer geolokatsiyasi (avtomatik o'qish)
 * - Manzil qidirish -> Nominatim (OSM) bo'yicha qidiruv + tanlash
 */
export default function MapPicker({
  lat,
  lng,
  onChange,
  onAddress,
  district,
  height = 260,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  onAddress?: (address: string) => void;
  district?: string | null;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const revAbort = useRef<AbortController | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [locating, setLocating] = useState(false);
  const [resolved, setResolved] = useState<string>('');
  const [geoErr, setGeoErr] = useState<string | null>(null);

  const makeMarker = (la: number, ln: number) => {
    if (markerRef.current) markerRef.current.remove();
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        background:linear-gradient(135deg,#10b981,#f59e0b);border:2.5px solid #fff;
        box-shadow:0 6px 16px rgba(16,185,129,.55);display:flex;align-items:center;justify-content:center;
      "><div style="transform:rotate(45deg);font-size:14px;color:#000;font-weight:900;">PC</div></div>`,
      iconSize: [36, 36],
      iconAnchor: [8, 33],
    });
    markerRef.current = L.marker([la, ln], { icon }).addTo(mapRef.current!);
  };

  const reverseGeocode = useCallback(async (la: number, ln: number) => {
    revAbort.current?.abort();
    const ctrl = new AbortController();
    revAbort.current = ctrl;
    try {
      const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${la}&lon=${ln}&zoom=16&accept-language=uz`;
      const res = await fetch(url, { signal: ctrl.signal });
      const j = await res.json();
      const label = j?.display_name || '';
      setResolved(label);
      onAddress?.(label);
    } catch {
      /* manzil topilmadi — muhim emas */
    }
  }, [onAddress]);

  const placeMark = useCallback((la: number, ln: number, opts?: { fly?: boolean; geocode?: boolean }) => {
    makeMarker(la, ln);
    onChange(la, ln);
    setResolved('');
    if (opts?.fly) {
      mapRef.current?.flyTo([la, ln], 16, { duration: 1.1 });
    } else {
      mapRef.current?.setView([la, ln], Math.max(mapRef.current?.getZoom() || 14, 14));
    }
    if (opts?.geocode !== false) reverseGeocode(la, ln);
  }, [onChange, reverseGeocode]);

  // District tanlanganda avtomatik koordinataga marker qo'yish
  useEffect(() => {
    if (!mapRef.current) return;
    const base =
      district && Object.keys(DISTRICT_COORDS).find((k) => district.toLowerCase().includes(k.toLowerCase()))
        ? DISTRICT_COORDS[district]
        : null;
    if (base) placeMark(base.lat, base.lng, { fly: true, geocode: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [TASHKENT_CENTER.lat, TASHKENT_CENTER.lng],
      zoom: 13,
      scrollWheelZoom: false,
      zoomControl: true,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      placeMark(e.latlng.lat, e.latlng.lng);
    });

    if (lat != null && lng != null) {
      map.setView([lat, lng], 14);
      makeMarker(lat, lng);
      reverseGeocode(lat, lng);
    }

    return () => {
      revAbort.current?.abort();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ================= GEOLOKATSIYA =================
  const useMyLocation = () => {
    setLocating(true);
    setGeoErr(null);
    if (!('geolocation' in navigator)) {
      setGeoErr('Brauzerda geolokatsiya qo\'llab-quvvatlanmaydi');
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        placeMark(pos.coords.latitude, pos.coords.longitude, { fly: true });
        setLocating(false);
      },
      () => {
        setGeoErr('Joylashuv o\'qib bo\'lmadi. Ruxsatni tekshiring.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  // ================= QIDIRUV (Nominatim) =================
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    setSearching(true);
    const h = setTimeout(async () => {
      try {
        // Toshkent chegarasida qidirish uchun viewbox
        const url =
          `${NOMINATIM}/search?format=json&addressdetails=0&limit=6&bounded=1` +
          `&viewbox=69.05%2C41.45%2C69.55%2C41.10&q=${encodeURIComponent(q)}`;
        const j = await (await fetch(url)).json();
        setResults(
          (Array.isArray(j) ? j : [])
            .filter((r: any) => r.lat && r.lon)
            .map((r: any) => ({
              lat: parseFloat(r.lat),
              lng: parseFloat(r.lon),
              label: `${r.display_name || (r.name || '')}`.slice(0, 120),
            }))
        );
        setShowResults(true);
      } catch {
        setResults([]);
      }
      setSearching(false);
    }, 450);
    return () => clearTimeout(h);
  }, [query]);

  const pickResult = (r: GeoResult) => {
    placeMark(r.lat, r.lng, { fly: true });
    setQuery(r.label);
    setResults([]);
    setShowResults(false);
  };

  const openInMaps = () => {
    if (lat == null || lng == null) return;
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank', 'noopener');
  };

  return (
    <div className="rounded-xl overflow-hidden border border-neon-cyan/20">
      <div className="relative">
        <div style={{ height }} ref={containerRef} />

        {/* Qidiruv — yuqori chap */}
        <div className="absolute top-2 left-2 right-2 z-[1000]">
          <div className="flex items-center gap-1.5 glass rounded-xl px-3 py-2 shadow-lg">
            <Search size={14} className="text-neon-cyan shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length && setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
              placeholder="Manzilni qidiring (masalan: Yunusobod...)..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-500"
            />
            {searching && <Loader2 size={13} className="animate-spin text-gray-500 shrink-0" />}
          </div>
          {showResults && results.length > 0 && (
            <div className="glass rounded-xl mt-1.5 max-h-48 overflow-y-auto scrollbar-thin shadow-lg">
              {results.map((r, i) => (
                <button
                  key={`${r.lat}-${r.lng}-${i}`}
                  onMouseDown={() => pickResult(r)}
                  className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-white/10 flex items-start gap-2"
                >
                  <MapPin size={12} className="text-neon-cyan shrink-0 mt-0.5" /> {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Geolokatsiya tugmasi — yuqori o'ng */}
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            useMyLocation();
          }}
          title="Mening joylashuvim"
          className="absolute top-2 right-2 z-[1000] w-9 h-9 rounded-xl glass grid place-items-center text-neon-cyan hover:bg-white/10 transition-colors shadow-lg"
        >
          {locating ? <Loader2 size={15} className="animate-spin" /> : <LocateFixed size={15} />}
        </button>
      </div>

      <div className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 bg-cyber-900">
        <span className="flex items-center gap-1.5">
          <MapPin size={13} className="text-neon-cyan shrink-0" />
          {resolved ? resolved.slice(0, 90) : 'Xaritaga bosing — manzil avtomatik aniqlanadi'}
        </span>
        {lat != null && lng != null && (
          <button
            onClick={openInMaps}
            className="ml-auto inline-flex items-center gap-1 font-bold text-neon-cyan hover:underline"
          >
            <Navigation size={11} /> Google Maps
          </button>
        )}
      </div>
      {geoErr && <div className="px-3 pb-1.5 text-xs text-red-400 bg-cyber-900">{geoErr}</div>}
    </div>
  );
}