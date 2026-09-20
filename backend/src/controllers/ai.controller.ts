import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { config } from '../config';
import { ok } from '../utils/response';

// ============================================================================
// CYBER-ZONE AI Yordamchi — Gemini orqali real LLM + app konteksti.
// Kontekst har bir so'rovda yangilanadi: faol xonalar, narxlar, promo-kodlar,
// yangiliklar, ish vaqti, FAQ. Gemini ishlamasa (oflayn/kvota) — oldingi
// qoidaviy (intent) tizimga auto-fallback qilinadi.
// ============================================================================

const INTRO = 'Men Cyber-ZONE AI yordamchisiman 🎮👋';

// ---------- Haqiqiy Gemini chaqiruv ----------
interface ChatHistoryItem {
  role: string;
  content: string;
}

/** Frontend'dan kelgan suhbat tarixini xavfsiz normallashtirish (token himoyasi). */
function sanitizeHistory(value: unknown): ChatHistoryItem[] {
  if (!Array.isArray(value)) return [];
  const out: ChatHistoryItem[] = [];
  let total = 0;
  for (const item of value.slice(-8)) {
    if (!item || typeof item !== 'object') continue;
    const raw: any = item;
    const role = raw.role;
    const content = typeof raw.content === 'string' ? raw.content.slice(0, 800) : '';
    const roleOk = role === 'user' || role === 'assistant' || role === 'model' || role === 'bot';
    if (!roleOk || !content.trim()) continue;
    total += content.length;
    if (total > 2000) break;
    out.push({ role: role === 'bot' || role === 'model' ? 'assistant' : 'user', content: content.trim() });
  }
  return out;
}

async function geminiChat(
  message: string,
  context: string,
  model: string,
  history: ChatHistoryItem[]
): Promise<string | null> {
  const key = config.ai.geminiApiKey;
  if (!key) return null;

  const system = [
    'Sen Cyber-ZONE — kompyuter xona (gaming club) platformasining rasmiy AI yordamchisisan.',
    'Foydalanuvchilarga o\'zbek tilida, do\'stona va aniq javob ber. Kerakli joyda emojilar ishlat 😊🎮💡.',
    'Savol platformaga tegishli bo\'lmasa (masalan, umumiy bilim) — qisqa va xushmuomalalik bilan javob ber, lekin imkoni boricha platformaga bog\'la.',
    'Narx, ish vaqti, xona ro\'yxati va promo-kodlar haqidagi ma\'lumotlarni FAQAT quyida berilgan KONTEKSTDAN ol. Unda yo\'q bo\'lsa — "hozircha ma\'lumot yomilgan" deb ayt, o\'ylab chiqma.',
    'Bron qilish qadamlari haqida aniq ayt: 1) xona sahifasi, 2) sana/vaqt/zonani tanlash, 3) promo-kod (agar bo\'lsa), 4) to\'lov (Uzum/Click/Payme/naqd), 5) tasdiqlanish.',
    'Havolalarni /rooms, /chat, /profile, /news kabi sahifa nomlari bilan ko\'rsat.',
    'Javobni 3-6 qisqa paragraf yoki ro\'yxat shaklida yoz, uzun bo\'lmasin.',
  ].join('\n');

  const body = {
    system_instruction: { parts: [{ text: system + '\n\n===== PLATFORMA KONTEKSTI =====\n' + context }] },
    contents: [
      ...history.map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
      { role: 'user', parts: [{ text: message }] },
    ],
    generationConfig: {
      temperature: config.ai.temperature,
      maxOutputTokens: config.ai.maxTokens,
      candidateCount: 1,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.warn(`[AI] Gemini ${model} xatosi ${resp.status}: ${errText.slice(0, 160)}`);
      if (resp.status === 400 || resp.status === 429 || resp.status === 500 || resp.status === 503) {
        const fallback = await geminiChatWithModel(message, context, config.ai.fallbackModel, history);
        if (fallback) return fallback;
      }
      return null;
    }

    const data = (await resp.json()) as any;
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text || '')
      .join('')
      .trim();
    if (!text) return null;
    return text;
  } catch (err) {
    console.warn('[AI] Gemini chaqiruv xatoligi:', (err as Error).message);
    const fallback = await geminiChatWithModel(message, context, config.ai.fallbackModel, history);
    return fallback;
  }
}

async function geminiChatWithModel(
  message: string,
  context: string,
  model: string,
  history: ChatHistoryItem[]
): Promise<string | null> {
  const key = config.ai.geminiApiKey;
  if (!key || !model) return null;
  const tmp = { ...config.ai, model };
  // Kichik ichki qayta-chiqarish — faqat bitta urinish, recursion yo'q
  const body = {
    system_instruction: {
      parts: [{ text: 'Sen Cyber-ZONE AI yordamchisisan. O\'zbek tilida qisqa va aniq javob ber. Kontekstdan foydalan:\n' + context }],
    },
    contents: [
      ...history.map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
      { role: 'user', parts: [{ text: message }] },
    ],
    generationConfig: { temperature: tmp.temperature, maxOutputTokens: tmp.maxTokens, candidateCount: 1 },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as any;
    return data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('').trim() || null;
  } catch {
    return null;
  }
}

// ---------- Kontekst yig'ish ----------
function formatPrice(n: number | string): string {
  return Number(n).toLocaleString('uz-UZ');
}

async function buildContext(): Promise<string> {
  const [rooms, promos, news] = await Promise.all([
    prisma.computerRoom.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        address: true,
        district: true,
        latitude: true,
        longitude: true,
        phone: true,
        workingHours: true,
        zones: { select: { type: true, name: true, pricePerHour: true, capacity: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.promoCode.findMany({
      where: { maxUses: { gt: 0 }, expiresAt: { gte: new Date() }, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.news.findMany({
      where: { isActive: true },
      orderBy: { publishedAt: 'desc' },
      take: 5,
      select: { title: true, type: true, content: true },
    }),
  ]);

  const roomLines = rooms.map((r) => {
    const minPrice = r.zones?.length ? Math.min(...r.zones.map((z) => Number(z.pricePerHour))) : null;
    const wh = (r.workingHours as any) || {};
    return `• ${r.name} (${r.address}${r.district ? ', ' + r.district : ''})${
      minPrice != null ? ` — narx ${formatPrice(minPrice)} so'm/soatdan` : ''
    }${wh.open ? `, ish vaqti ${wh.open}-${wh.close}` : ''}${r.phone ? `, tel: ${r.phone}` : ''}`;
  });

  const promoLines = promos.map((p) => {
    const val = p.discountType === 'PERCENTAGE' ? `${p.discountValue}%` : `${formatPrice(Number(p.discountValue))} so'm`;
    const used = p.maxUses ? ` (qolgan: ${Math.max(0, p.maxUses - p.usedCount)})` : '';
    return `• ${p.code} — ${val}${p.minBookingAmount ? ` (min ${formatPrice(Number(p.minBookingAmount))} so'm)` : ''}${used}`;
  });

  const newsLines = news.map((n) => `• [${n.type}] ${n.title} — ${n.content.slice(0, 90)}`);

  const faq = [
    'Qanday to\'lash mumkin? — Uzum, Click, PayMe, UZCard/HUMO kartasi yoki xonada naqd. Bron 30% avans, qolgani 70% bron vaqtida.',
    'Bronni qanday bekor qilish? — Profil > Bronlar bo\'limi, yoki admin/super admin\'ga murojaat qiling.',
    'Bonus ballar qanday ishlaydi? — Har to\'lovdan bonus ballar yig\'iladi (1 ball = 1 so\'m), keyingi bronlarda ishlatish mumkin.',
    'Parol unutildi? — Login sahifasida "Parolni unutdingizmi" tugmasi orqali email\'ga havola yuboriladi.',
    'Xona qanday topiladi? — /rooms sahifasi, xarita yoki AI\'dan "yaqin xonalari ko\'rsat" deb so\'rash mumkin.',
    'Suhbat qayerda? — Xonalar chat (har bir xona), Admin bilan shaxsiy yozishma va Super Admin support mavjud.',
  ].join('\n');

  return [
    'FAOL XONALAR:',
    roomLines.length ? roomLines.join('\n') : 'Hozircha faol xona yo\'q.',
    '',
    'PROMO-KODLAR:',
    promoLines.length ? promoLines.join('\n') : 'Hozircha faol promo-kod yo\'q.',
    '',
    'YANGILIKLAR:',
    newsLines.length ? newsLines.join('\n') : 'Hozircha yangilik yo\'q.',
    '',
    'FAQ:',
    faq,
  ].join('\n');
}

function countWords(msg: string): number {
  return msg.trim().split(/\s+/).filter(Boolean).length;
}

// Qoidaviy fallback (Gemini bo'lmasa)
function lower(s: string) {
  return s.toLowerCase().replace(/['’`]+/g, '').replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectFallbackIntent(msg: string): string {
  const m = lower(msg);
  const has = (...words: string[]) => words.some((w) => m.includes(w));
  if (has('salom', 'assalom', ' hello', ' hi', 'hey', 'privet', 'vaalejkum', 'valejkum')) return 'greeting';
  if (has('rahmat', 'tashakkur', ' thanks', ' thank')) return 'thanks';
  if (has('xayr', 'alvido', 'kettik', 'sog bo')) return 'bye';
  if (has('promo', 'chegirm', 'skidka', 'aktsiy', 'aksiy', 'bonus')) return 'promo';
  if (has('bron', 'zahiralash', 'band qil', 'bekor qil')) return 'booking';
  if (has('narx', 'narxi', 'soatiga', 'soati', 'qancha turad', ' price', ' cost', 'baxo', 'baho')) return 'prices';
  if (has('ish vaqti', 'nechadan', 'nechagacha', 'ochiq', 'yopiq', 'qachon')) return 'working_hours';
  if (has('yaqin', 'atrof', 'masof', ' near')) return 'nearest';
  if (has('qidir', 'topib', 'izla', 'ko rsat', 'ro yxat', 'royhat', 'qaysi', 'search', 'game', 'kompyuter', 'cyber', 'xonalar')) return 'search_rooms';
  return 'fallback';
}

async function fallbackReply(message: string, lat?: number, lng?: number): Promise<string> {
  const intent = detectFallbackIntent(message);
  if (intent === 'greeting') {
    return countWords(message) <= 3
      ? `${INTRO}\n\nSalom! Savolingizni yozing — masalan "narxlar qanday" yoki "yaqin xonalari ko'rsat".`
      : 'Salom! Xonalar, narxlar, bron qilish va promo-kodlar bo\'yicha yordam bera olaman. Nima bilmoqchisiz?';
  }
  if (intent === 'thanks') return 'Arzimaydi! Boshqa savolingiz bo\'lsa, bemalol so\'rang.';
  if (intent === 'bye') return 'Xayr! Tashrifingiz uchun rahmat. Yana keling! 👋';

  if (intent === 'promo') {
    const promos = await prisma.promoCode.findMany({
      where: { maxUses: { gt: 0 }, expiresAt: { gte: new Date() }, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    if (!promos.length) return 'Hozircha faol promo-kodlar yo\'q, ammo yangilari tez orada! Adminlarga murojaat qiling.';
    const list = promos
      .map((p) => `• ${p.code} — ${p.discountType === 'PERCENTAGE' ? `${p.discountValue}%` : `${formatPrice(Number(p.discountValue))} so'm`}`)
      .join('\n');
    return `Faol promo-kodlar:\n${list}\n\nBron qilishda kodni kiritishni unutmang!`;
  }

  if (intent === 'booking') {
    return "Bron qilish uchun:\n1. Kerakli xona sahifasiga o'ting\n2. Sana, vaqt va zonani tanlang\n3. Promo-kod bo'lsa kiriting\n4. To'lovni amalga oshiring — bron tayyor!\n\nSavol bo'lsa, adminlarimiz yordam beradi. 👨‍💻";
  }

  if (intent === 'prices') {
    const rooms = await prisma.computerRoom.findMany({
      where: { status: 'ACTIVE' },
      select: { name: true, address: true, zones: { select: { pricePerHour: true } } },
    });
    if (!rooms.length) return 'Hozircha xonalar mavjud emas.';
    const lines = rooms.map((r) => {
      const min = r.zones.length ? Math.min(...r.zones.map((z) => Number(z.pricePerHour))) : null;
      return `• ${r.name} — ${r.address}${min != null ? ` (dan ${formatPrice(min)} so'm/soat)` : ''}`;
    });
    return `Xonalar narxlari (so'm/soat):\n${lines.join('\n')}\n\nBatafsil narxlar har bir xona sahifasida.`;
  }

  if (intent === 'working_hours') {
    const rooms = await prisma.computerRoom.findMany({
      where: { status: 'ACTIVE' },
      select: { name: true, workingHours: true },
    });
    const lines = rooms.map((r) => {
      const wh = (r.workingHours as any) || {};
      return `• ${r.name} — ${wh.open || '09:00'} dan ${wh.close || '23:00'} gacha`;
    });
    return `Ish vaqti:\n${lines.join('\n')}\n\nAksariyat xonalar har kuni ishlaydi.`;
  }

  if (intent === 'nearest') {
    const rooms = await prisma.computerRoom.findMany({
      where: { status: 'ACTIVE' },
      select: { name: true, address: true, latitude: true, longitude: true, zones: { select: { pricePerHour: true } } },
    });
    const haversine = (a: number, b: number, c: number, d: number) => {
      const R = 6371;
      const toRad = (x: number) => (x * Math.PI) / 180;
      const dLat = toRad(c - a);
      const dLon = toRad(d - b);
      const t = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.asin(Math.sqrt(t));
    };
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const sorted = rooms
        .map((r) => ({
          ...r,
          dist: r.latitude != null && r.longitude != null ? Math.round(haversine(lat!, lng!, r.latitude, r.longitude) * 10) / 10 : null,
        }))
        .sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity))
        .slice(0, 3);
      const lines = sorted.map((r) => {
        const min = r.zones.length ? Math.min(...r.zones.map((z) => Number(z.pricePerHour))) : null;
        return `• ${r.name} — ${r.address}${min != null ? ` (${formatPrice(min)} so'm/soat)` : ''}${r.dist != null ? ` (~${r.dist} km)` : ''}`;
      });
      return `Sizga eng yaqin xonalar:\n${lines.join('\n')}\n\nAniqroq ma'lumot uchun lokatsiyangiz yoqilganiga ishonch hosil qiling.`;
    }
    return `Yaqin xonalarni ko'rsatish uchun lokatsiya kerak. Hozircha eng birinchi xonalar:\n${rooms.slice(0, 5).map((r) => `• ${r.name} — ${r.address}`).join('\n')}`;
  }

  if (intent === 'search_rooms') {
    const rooms = await prisma.computerRoom.findMany({ where: { status: 'ACTIVE' }, select: { name: true, address: true } });
    return `Bizda quyidagi xonalar bor:\n${rooms.slice(0, 8).map((r) => `• ${r.name} — ${r.address}`).join('\n')}\n\n/rooms sahifasiga o'ting va qidiring.`;
  }

  return `Kechirasiz, buni aniq tushunmadim. Narxlar, xonalar, ish vaqti, promo-kodlar va bron haqida so'rashingiz mumkin.`;
}

// ============ POST /api/ai/chat — AI yordamchi ============
export const chat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message, history } = req.body as { message?: string; history?: unknown; lat?: number; lng?: number };
    if (!message || !message.trim()) {
      return ok(res, { reply: `${INTRO}\n\nNarxlar, xonalar, ish vaqti, promo-kodlar va bron haqida so'rashingiz mumkin.` });
    }

    // Xarajat himoyasi: xabarni cheklaymiz
    const msg = message.trim().slice(0, 500);
    const hist = sanitizeHistory(history);
    const { lat, lng } = req.query as { lat?: string; lng?: string };
    const latN = Number(lat);
    const lngN = Number(lng);

    // 1) Haqiqiy Gemini bilan javob berish
    const context = await buildContext();
    let reply: string | null = null;
    try {
      reply = await geminiChat(msg, context, config.ai.model, hist);
    } catch (err) {
      console.warn('[AI] Gemini chat xatoligi:', (err as Error).message);
    }

    // 2) Gemini ishlamasa — qoidaviy fallback
    if (!reply) {
      reply = await fallbackReply(msg, Number.isFinite(latN) ? latN : undefined, Number.isFinite(lngN) ? lngN : undefined);
    }

    return ok(res, { reply, model: reply ? (config.ai.model) : 'fallback' });
  } catch (err) {
    next(err);
  }
};