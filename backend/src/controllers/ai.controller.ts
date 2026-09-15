import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { ok } from '../utils/response';

function lower(s: string) {
  return s.toLowerCase().replace(/['’`]+/g, '').replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectIntent(msg: string): string {
  const m = lower(msg);
  const has = (...words: string[]) => words.some((w) => m.includes(w));
  if (has('salom', 'assalom', ' hello', ' hi', 'hey', 'privet', 'vaalejkum', 'valejkum')) {
    return has('xo', 'xosh') && has('yo', 'yoq') ? 'greeting_big' : 'greeting';
  }
  if (has('rahmat', 'tashakkur', ' thanks', ' thank')) return 'thanks';
  if (has('xayr', 'alvido', 'kettik', 'sog bo')) return 'bye';
  if (has('promo', 'chegirm', 'skidka', 'aktsiy', 'aksiy', 'bonus')) return 'promo';
  if (has('bron', 'zahiralash', 'band qil', 'bekor qil')) return 'booking';
  if (has('narx', 'narxi', 'soatiga', 'soati', 'qancha turad', ' price', ' cost', 'baxo', 'baho')) return 'prices';
  if (has('ish vaqti', 'nechadan', 'nechagacha', 'soat nechadan', 'ochiq', 'yopiq', 'qachon')) return 'working_hours';
  if (has('yaqin', 'atrof', 'masof', ' near', 'nearing', 'eng yaqin')) return 'nearest';
  if (has('qidir', 'topib', 'izla', 'ko rsat', 'ro yxat', 'royhat', 'qaysi', ' search', 'game', 'kompyuter', 'cyber', 'xonalar')) return 'search_rooms';
  return 'fallback';
}

const INTRO = 'Men Cyber-Zone AI yordamchisiman 🎮';
const HELP_HINT = 'Sizga: xonalar ro\'yxati, yaqindagi xonalar, narxlar, ish vaqti, bron va promo-kodlar bo\'yicha yordam bera olaman.';

async function getRoomsData() {
  return prisma.computerRoom.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      address: true,
      latitude: true,
      longitude: true,
      createdAt: true,
      zones: { select: { type: true, pricePerHour: true, capacity: true } },
      _count: { select: { reviews: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

function formatPrice(n: number | string): string {
  return Number(n).toLocaleString('uz-UZ');
}

function roomLine(r: { name: string; address: string; zones?: { type: string; pricePerHour: number | string }[] }): string {
  const minPrice = r.zones?.length
    ? Math.min(...r.zones.map((z) => Number(z.pricePerHour)))
    : null;
  const price = minPrice !== null ? ` (dan ${formatPrice(minPrice)} so'm/soat)` : '';
  return `• ${r.name} — ${r.address}${price}`;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function countWords(msg: string): number {
  return lower(msg).split(' ').filter(Boolean).length;
}

// ============ POST /api/ai/chat — AI yordamchi ============
export const chat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message } = req.body as { message?: string };
    if (!message || !message.trim()) {
      return ok(res, { reply: `${INTRO}\n\n${HELP_HINT}` });
    }

    const msg = message.trim();
    const intent = detectIntent(msg);

    if (intent === 'greeting' || intent === 'greeting_big') {
      const reply =
        intent === 'greeting' || countWords(msg) <= 3
          ? `${INTRO}\n\nSalom! Savolingizni yozing — masalan, "yaqindagi xonalari ko'rsat" yoki "narxlar qanday".\n\n${HELP_HINT}`
          : `Salom! Xonalar, narxlar, bron qilish va promo-kodlar bo'yicha yordam bera olaman. Nima bilmoqchisiz?`;
      return ok(res, { reply });
    }

    if (intent === 'thanks') {
      return ok(res, { reply: 'Arzimaydi! Boshqa savolingiz bo\'lsa, bemalol so\'rang.' });
    }

    if (intent === 'bye') {
      return ok(res, { reply: 'Xayr! Tashrifingiz uchun rahmat. Yana keling! 👋' });
    }

    if (intent === 'promo') {
      const promos = await prisma.promoCode.findMany({
        where: { maxUses: { gt: 0 }, expiresAt: { gte: new Date() } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      if (!promos.length) {
        return ok(res, { reply: 'Hozircha faol promo-kodlar yo\'q, ammo yangilari tez orada! Odminlarga murojaat qiling.' });
      }
      const list = promos
        .map((p) => {
          const val = p.discountType === 'PERCENTAGE' ? `${p.discountValue}%` : `${formatPrice(p.discountValue)} so'm`;
          const used = p.maxUses ? ` (qolgan: ${Math.max(0, p.maxUses - p.usedCount)})` : '';
          return `• ${p.code} — ${val}${p.minBookingAmount ? ` (min. ${formatPrice(p.minBookingAmount)} so'm)` : ''}${used}`;
        })
        .join('\n');
      return ok(res, { reply: `Faol promo-kodlar:\n${list}\n\nBron qilishda kodni kiritishni unutmang!` });
    }

    if (intent === 'booking') {
      return ok(res, {
        reply:
          "Bron qilish uchun:\n1. Kerakli xona sahifasiga o'ting\n2. Sana, vaqt va zonani tanlang\n3. Promo-kod bo'lsa kiriting va ta'kidlang\n4. To'lovni amalga oshiring — bron tayyor!\n\nSavol bo'lsa, adminlarimiz yordam beradi. 👨‍💻",
      });
    }

    if (intent === 'prices') {
      const rooms = await getRoomsData();
      if (!rooms.length) return ok(res, { reply: 'Hozircha xonalar mavjud emas.' });
      const lines = rooms.map(roomLine).join('\n');
      return ok(res, {
        reply: `Xonalar narxlari (so'm/soat):\n${lines}\n\nBatafsil narxlar har bir xona sahifasida ko'rsatilgan.`,
      });
    }

    if (intent === 'working_hours') {
      const rooms = await prisma.computerRoom.findMany({
        where: { status: 'ACTIVE' },
        select: { name: true, workingHours: true },
      });
      if (!rooms.length) return ok(res, { reply: 'Hozircha xona ma\'lumotlari yo\'q.' });
      const lines = rooms
        .map((r) => `• ${r.name} — ${(r.workingHours as any)?.open || '09:00'} dan ${(r.workingHours as any)?.close || '23:00'} gacha`)
        .join('\n');
      return ok(res, { reply: `Ish vaqti:\n${lines}\n\nAksariyat xonalar har kuni ishlaydi.` });
    }

    if (intent === 'nearest') {
      const { lat, lng } = req.query as { lat?: string; lng?: string };
      const rooms = await getRoomsData();
      const latN = Number(lat);
      const lngN = Number(lng);
      if (Number.isFinite(latN) && Number.isFinite(lngN)) {
        const sorted = rooms
          .map((r) => ({
            ...r,
            distanceKm:
              r.latitude != null && r.longitude != null
                ? Math.round(haversine(latN, lngN, r.latitude, r.longitude) * 10) / 10
                : null,
          }))
          .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
          .slice(0, 3);
        const lines = sorted.map((r) => `${roomLine(r)}${r.distanceKm != null ? ` (~${r.distanceKm} km)` : ''}`).join('\n');
        return ok(res, {
          reply: `Sizga eng yaqin xonalar:\n${lines}\n\nKonkretroq ma'lumot uchun lokatsiyangizni yoqing.`,
        });
      }
      const lines = rooms.slice(0, 5).map(roomLine).join('\n');
      return ok(res, { reply: `Birinchi xonalar:\n${lines}` });
    }

    if (intent === 'search_rooms') {
      const rooms = await getRoomsData();
      if (!rooms.length) return ok(res, { reply: 'Hozircha faol xonalar yo\'q.' });
      const lines = rooms.slice(0, 8).map(roomLine).join('\n');
      return ok(res, { reply: `Bizda quyidagi xonalar bor:\n${lines}\n\nShunchaki /rooms sahifasiga o'ting va qidiring.` });
    }

    const fallbackReplies = [
      `Kechirasiz, buni aniq tushunmadim. ${HELP_HINT}`,
      `Bu savolga hozircha javobim yo'q 🤔 ${HELP_HINT}`,
    ];
    const idx = Array.from(msg).reduce((a, ch) => a + ch.charCodeAt(0), 0) % fallbackReplies.length;
    return ok(res, { reply: fallbackReplies[idx] });
  } catch (err) {
    next(err);
  }
};