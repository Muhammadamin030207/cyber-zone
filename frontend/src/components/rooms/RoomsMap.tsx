'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Loader2, LocateFixed, Navigation } from 'lucide-react';
import type { Room } from '@/lib/types';
import { roomCoords, TASHKENT_CENTER } from '@/lib/constants';
import { formatPrice } from '@/lib/utils';

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export default function RoomsMap({ rooms, height = 440, linkBase = '/rooms' }: { rooms: Room[]; height?: number; linkBase?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [TASHKENT_CENTER.lat, TASHKENT_CENTER.lng],
      zoom: 12,
      scrollWheelZoom: false,
      zoomControl: true,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    setReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      setReady(false);
    };
  }, []);

  const applyMarkers = useCallback((roomsList: Room[], active: string | null, my: { lat: number; lng: number } | null) => {
    const map = mapRef.current;
    if (!map) return;

    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });
    markersRef.current.clear();

    const markers = roomsList.map((room, i) => {
      const { lat, lng } = roomCoords(room);
      const isActive = active === room.id;
      const dist = my ? haversineKm(my, { lat, lng }) : null;
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:${isActive ? 42 : 34}px;height:${isActive ? 42 : 34}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
          background:linear-gradient(135deg,#10b981,#f59e0b);border:2.5px solid #fff;
          box-shadow:0 6px 16px rgba(16,185,129,.55);display:flex;align-items:center;justify-content:center;
          transition:all .2s ease;
        "><div style="transform:rotate(45deg);font-size:${isActive ? 15 : 13}px;color:#000;font-weight:900;">${i + 1}</div></div>`,
        iconSize: [isActive ? 42 : 34, isActive ? 42 : 34],
        iconAnchor: [isActive ? 10 : 8, isActive ? 38 : 31],
      });

      const price = room.zones?.length ? Math.min(...room.zones.map((z) => Number(z.pricePerHour))) : 0;
      const popupHtml = `
        <div style="font-family:Inter,system-ui,sans-serif;min-width:210px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#10b981,#f59e0b);color:#000;font-weight:900;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</span>
            <div style="font-weight:800;color:#0b3b33;font-size:14px;line-height:1.2;">${room.name}</div>
          </div>
          <div style="font-size:12px;color:#555;margin-bottom:4px;">${room.address || ''}</div>
          <div style="font-size:13px;color:#b45309;font-weight:800;margin-bottom:4px;">${formatPrice(price)} so'm/soat dan</div>
          ${dist != null ? `<div style="font-size:12px;color:#0b7285;font-weight:700;margin-bottom:8px;">📏 Sizdan ${dist.toFixed(1)} km</div>` : ''}
          <div style="display:flex;gap:6px;">
            <a href="${linkBase}/${room.id}" style="display:inline-flex;font-size:12px;font-weight:800;color:#fff;background:linear-gradient(135deg,#10b981,#0d9668);padding:5px 12px;border-radius:9999px;text-decoration:none;box-shadow:0 4px 10px rgba(16,185,129,.4);">Batafsil →</a>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank" rel="noopener" style="display:inline-flex;font-size:12px;font-weight:800;color:#fff;background:linear-gradient(135deg,#6366f1,#4338ca);padding:5px 12px;border-radius:9999px;text-decoration:none;box-shadow:0 4px 10px rgba(99,102,241,.4);">Yo'nalish</a>
          </div>
        </div>`;

      const marker = L.marker([lat, lng], { icon }).addTo(map);
      marker.bindPopup(popupHtml, { closeButton: false });
      marker.on('click', () => setActiveId(room.id));
      marker.on('popupclose', () => setActiveId(null));
      markersRef.current.set(room.id, marker);
      return { marker, room, lat, lng };
    });

    if (markers.length) {
      if (my) {
        const nearest = markers.reduce((a, b) =>
          haversineKm(my, { lat: a.lat, lng: a.lng }) < haversineKm(my, { lat: b.lat, lng: b.lng }) ? a : b
        );
        map.flyTo([nearest.lat, nearest.lng], Math.max(map.getZoom(), 14), { duration: 0.9 });
        nearest.marker.openPopup();
      } else {
        const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      }
    } else {
      map.setView([TASHKENT_CENTER.lat, TASHKENT_CENTER.lng], 12);
    }
  }, [linkBase]);

  useEffect(() => {
    applyMarkers(rooms, activeId, myPos);
  }, [rooms, ready, activeId, myPos, applyMarkers]);

  // ===== Eng yaqin xona =====
  const findNearest = () => {
    setLocating(true);
    setLocErr(null);
    if (!('geolocation' in navigator)) {
      setLocErr('Brauzeringiz geolokatsiyani qo\'llab-quvvatlamaydi');
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyPos(p);
        setLocating(false);
        if (rooms.length) {
          const nearest = rooms.reduce((a, b) =>
            haversineKm(p, roomCoords(a)) < haversineKm(p, roomCoords(b)) ? a : b
          );
          setActiveId(nearest.id);
          const mk = markersRef.current.get(nearest.id);
          // markerlar yana render bo'lgach popup ochiladi (applyMarkers my bilan)
          if (mk) {
            mapRef.current?.flyTo([roomCoords(nearest).lat, roomCoords(nearest).lng], 15, { duration: 0.9 });
            mk.openPopup();
          }
        }
      },
      () => {
        setLocErr('Joylashuv o\'qib bo\'lmadi. Ruxsatni tekshiring.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const nearestRoom = myPos && rooms.length
    ? rooms.reduce((a, b) => (haversineKm(myPos, roomCoords(a)) < haversineKm(myPos, roomCoords(b)) ? a : b), rooms[0])
    : null;
  const nearestText = nearestRoom ? `Eng yaqin: ${nearestRoom.name} · ${haversineKm(myPos!, roomCoords(nearestRoom)).toFixed(1)} km` : null;

  return (
    <div className="neo-card rounded-2xl overflow-hidden">
      <div className="relative z-0">
        <div style={{ height }} ref={containerRef} />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-cyber-900/80">
            <Loader2 size={22} className="animate-spin text-neon-cyan" />
          </div>
        )}
        {rooms.length > 0 && (
          <button
            onClick={findNearest}
            disabled={locating}
            className="absolute bottom-3 right-3 z-[1000] inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl glass border border-neon-cyan/30 text-neon-cyan hover:bg-white/10 transition-colors shadow-lg disabled:opacity-50"
          >
            {locating ? <Loader2 size={13} className="animate-spin" /> : <LocateFixed size={13} />}
            Eng yaqin
          </button>
        )}
      </div>
      <div className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <MapPin size={14} className="text-neon-cyan" />
          {rooms.length} ta xona xaritada · marker ustiga bosing — batafsil ma&apos;lumot ko&apos;rinadi
        </span>
        {nearestText && (
          <span className="inline-flex items-center gap-1.5 text-neon-green font-bold">
            <Navigation size={12} /> {nearestText}
          </span>
        )}
        {locErr && <span className="text-red-400">{locErr}</span>}
      </div>
    </div>
  );
}