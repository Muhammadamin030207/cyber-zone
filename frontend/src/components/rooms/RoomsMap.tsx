'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Loader2 } from 'lucide-react';
import type { Room } from '@/lib/types';
import { roomCoords, TASHKENT_CENTER } from '@/lib/constants';
import { formatPrice } from '@/lib/utils';
import { Link } from '@/i18n/navigation';

export default function RoomsMap({ rooms }: { rooms: Room[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [ready, setReady] = useState(false);

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
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Markerlarni yangilash
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });

    const markers = rooms.map((room) => {
      const { lat, lng } = roomCoords(room);
      const icon = L.divIcon({
        className: '',
        html: `<div class="cz-marker" style="
          width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
          background:linear-gradient(135deg,#10b981,#f59e0b);border:2px solid #fff;
          box-shadow:0 4px 12px rgba(16,185,129,.5);display:flex;align-items:center;justify-content:center;
        "><div style="transform:rotate(45deg);font-size:14px;color:#000;font-weight:800;">PC</div></div>`,
        iconSize: [34, 34],
        iconAnchor: [8, 34],
      });

      const price = room.zones?.length ? Math.min(...room.zones.map((z) => Number(z.pricePerHour))) : 0;
      const popupHtml = `
        <div style="font-family:Inter,sans-serif;min-width:180px;">
          <div style="font-weight:800;color:#0b3b33;margin-bottom:2px;">${room.name}</div>
          <div style="font-size:12px;color:#555;margin-bottom:4px;">${room.address || ''}</div>
          <div style="font-size:12px;color:#b45309;font-weight:700;margin-bottom:6px;">${formatPrice(price)} so'm/soat dan</div>
          <a href="/rooms/${room.id}" style="display:inline-block;font-size:12px;font-weight:700;color:#fff;background:#10b981;padding:4px 10px;border-radius:8px;text-decoration:none;">Batafsil</a>
        </div>`;

      const marker = L.marker([lat, lng], { icon }).addTo(map);
      marker.bindPopup(popupHtml, { closeButton: false });
      return { marker, room, lat, lng };
    });

    if (markers.length) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } else {
      map.setView([TASHKENT_CENTER.lat, TASHKENT_CENTER.lng], 12);
    }
  }, [rooms, ready]);

  return (
    <div className="neo-card rounded-2xl overflow-hidden">
      <div className="h-[440px]" ref={containerRef} />
      {rooms.length > 0 && (
        <div className="px-4 py-3 flex items-center gap-2 text-xs text-gray-400">
          <MapPin size={14} className="text-neon-cyan" />
          {rooms.length} ta xona xaritada · marker ustiga bosing — batafsil ma\'lumot ko\'rinadi
        </div>
      )}
    </div>
  );
}