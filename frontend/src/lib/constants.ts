export const TASHKENT_DISTRICTS = [
  'Chilonzor',
  'Mirzo Ulug\u2019bek',
  'Yakkasaroy',
  'Yunusobod',
  'Olmazor',
  'Bektemir',
  'Sergeli',
  'Shayxontohur',
  'Uchtepa',
  'Yangihayot',
  'Yashnobod',
  'Mirobod',
  'Tinchlik',
];

// Toshkent tumanlari — taxminiy markaz koordinatalari (xarita uchun)
export const DISTRICT_COORDS: Record<string, { lat: number; lng: number }> = {
  Chilonzor: { lat: 41.2784, lng: 69.1992 },
  'Mirzo Ulug\u2019bek': { lat: 41.2649, lng: 69.3349 },
  Yakkasaroy: { lat: 41.2780, lng: 69.2620 },
  Yunusobod: { lat: 41.3111, lng: 69.2797 },
  Olmazor: { lat: 41.2930, lng: 69.1667 },
  Bektemir: { lat: 41.2200, lng: 69.3200 },
  Sergeli: { lat: 41.2300, lng: 69.2100 },
  Shayxontohur: { lat: 41.3160, lng: 69.2580 },
  Uchtepa: { lat: 41.3270, lng: 69.1920 },
  Yangihayot: { lat: 41.2000, lng: 69.2500 },
  Yashnobod: { lat: 41.3420, lng: 69.3016 },
  Mirobod: { lat: 41.2730, lng: 69.2810 },
  Tinchlik: { lat: 41.3300, lng: 69.2000 },
};

export const TASHKENT_CENTER = { lat: 41.2995, lng: 69.2401 };

// Xonaning koordinatasi bo'lmasa, tuman markazidan foydalanamiz
export function roomCoords(room: { latitude?: number | null; longitude?: number | null; district?: string | null }): { lat: number; lng: number } {
  if (room.latitude && room.longitude) return { lat: room.latitude, lng: room.longitude };
  const d = room.district ? Object.keys(DISTRICT_COORDS).find((k) => room.district!.toLowerCase().includes(k.toLowerCase())) : undefined;
  if (d) return DISTRICT_COORDS[d];
  return TASHKENT_CENTER;
}

export const PAYMENT_METHODS = ['PAYME', 'CLICK', 'UZCARD', 'HUMO', 'CASH'] as const;

export const REAL_TIME_BADGE = { free: 'Bo\u2019sh', busy: 'Ishladi' } as const;