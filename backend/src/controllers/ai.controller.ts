import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { config } from '../config';
import { ok } from '../utils/response';
import { AuthRequest } from '../types';
import {
  tashkentNowHHMM,
  parseTime,
  minutesToHHMM,
  normalizeWorkingHours,
} from '../utils/time';
import { SITE_SETTING_KEYS } from './settings.controller';

// Gemini chaqiruv uchun taym-aut (abadiy kutib qolishning oldini oladi)
const GEMINI_TIMEOUT_MS = 15_000;

function fetchWithTimeout(url: string, init: RequestInit, ms = GEMINI_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

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
): Promise<{ text: string; model: string } | null> {
  const key = config.ai.geminiApiKey;
  if (!key) {
    console.warn('[AI] GEMINI_API_KEY o\'rnatilmagan — qoidaviy fallback javob ishlatilmoqda. AI sifatli javob berishi uchun Render dashboard\'da GEMINI_API_KEY ko\'rsatilishi shart.');
    return null;
  }

  const system = [
    'Sen Cyber-ZONE — kompyuter xona (gaming club) platformasining rasmiy AI yordamchisisan.',
    'Foydalanuvchilarga o\'zbek tilida, do\'stona va aniq javob ber. Kerakli joyda emojilar ishlat 😊🎮💡.',
    'Foydalanuvchi oddiy suhbat qurmoqchi bo\'lsa (salomlashish, o\'yinlar, umumiy savollar, maslahat) — erkin, qisqa va xushmuomalalik bilan javob ber. Sun\'iy ravishda hamma savolni platformaga bog\'lash shart emas.',
    'Narx, ish vaqti, xona ro\'yxati, promo-kodlar va mavjudlik haqidagi ma\'lumotlarni FAQAT quyida berilgan KONTEKSTDAN ol. Unda yo\'q bo\'lsa — "hozircha ma\'lumot yo\'q" deb ayt, o\'ylab chiqma.',
    'Foydalanuvchining shaxsiy bronlari, to\'lovlari, bonus balansi, profil ma\'lumoti faqat KONTEKSTDAGI "FOYDALANUVCHI MA\'LUMOTI" bo\'limida berilganini ayt. U yerda yo\'q narsani uydirma. Masalan bron holati haqida faqat ro\'yxatda kelgan bronlarni ko\'rsat.',
    'AI hech qachon bronni o\'zi tasdiqlamaydi, to\'lovni muvaffaqiyatli deb aytmaydi va narxni taxmin qilmaydi — bular platforma/backenda tekshiriladi.',
    'Bron qilish qadamlari haqida aniq ayt: 1) xona sahifasi, 2) sana/vaqt/zonani tanlash, 3) promo-kod (agar bo\'lsa), 4) to\'lov (Click/PayMe/naqd), 5) tasdiqlanish.',
    'Havolalarni /rooms, /chat, /profile, /news kabi sahifa nomlari bilan ko\'rsat.',
    'Foydalanuvchining tiliga moslash: o\'zbekcha — o\'zbekcha, ruscha — ruscha, inglizcha — inglizcha javob ber.',
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

  const primaryModel = model;
  try {
    const resp = await fetchWithTimeout(url, {
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
    return { text, model: primaryModel };
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
): Promise<{ text: string; model: string } | null> {
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
    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as any;
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('').trim() || null;
    if (!text) return null;
    return { text, model };
  } catch {
    return null;
  }
}

// ---------- Claude (Anthropic) — server-side, kalit frontendga chiqmaydi ----------
const ANTHROPIC_VERSION = '2023-06-01';

// Ikkala LLM (Gemini/Claude) uchun umumiy tizim yo'riqnomasi.
function buildSystemPrompt(context: string): string {
  return [
    'Sen Cyber-ZONE — kompyuter xona (gaming club) platformasining rasmiy AI yordamchisisan.',
    'Foydalanuvchilarga o\'zbek tilida, do\'stona va aniq javob ber. Kerakli joyda emojilar ishlat.',
    'Narx, ish vaqti, xona ro\'yxati, promo-kodlar va mavjudlik haqidagi ma\'lumotlarni FAQAT quyida berilgan KONTEKSTDAN ol. Unda yo\'q bo\'lsa — "hozircha ma\'lumot yo\'q" deb ayt, o\'ylab chiqma.',
    "Foydalanuvchining shaxsiy bronlari, to'lovlari, bonus balansi, profil ma'lumoti faqat KONTEKSTDAGI \"FOYDALANUVCHI MA'LUMOTI\" bo'limida berilganini ayt.",
    'AI hech qachon bronni o\'zi tasdiqlamaydi, to\'lovni muvaffaqiyatli deb aytmaydi va narxni taxmin qilmaydi.',
    'Bron qilish qadamlari haqida aniq ayt: 1) xona sahifasi, 2) sana/vaqt/zonani tanlash, 3) promo-kod (agar bo\'lsa), 4) to\'lov (Click/PayMe/naqd), 5) tasdiqlanish.',
    'Havolalarni /rooms, /chat, /profile, /news kabi sahifa nomlari bilan ko\'rsat.',
    'Foydalanuvchining tiliga moslash: o\'zbekcha — o\'zbekcha, ruscha — ruscha, inglizcha — inglizcha javob ber.',
    'Javobni 3-6 qisqa paragraf yoki ro\'yxat shaklida yoz, uzun bo\'lmasin.',
    '',
    '===== PLATFORMA KONTEKSTI =====',
    context,
  ].join('\n');
}

/** Claude Messages API orqali yagona (streamsiz) javob. Kalit yo'q bo'lsa — null. */
async function claudeChat(
  message: string,
  context: string,
  model: string,
  history: ChatHistoryItem[]
): Promise<{ text: string; model: string } | null> {
  const key = config.ai.anthropicApiKey;
  if (!key) {
    console.warn("[AI] ANTHROPIC_API_KEY o'rnatilmagan — Claude ishlatilmadi. Gemini yoki qoidaviy javobga o'tiladi.");
    return null;
  }
  const url = `${config.ai.anthropicEndpoint.replace(/\/$/, '')}/v1/messages`;
  const body = {
    model,
    system: buildSystemPrompt(context),
    messages: [
      ...history.map((h) => ({
        role: h.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: h.content,
      })),
      { role: 'user' as const, content: message },
    ],
    max_tokens: config.ai.maxTokens,
    temperature: config.ai.temperature,
  };
  try {
    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.warn(`[AI] Claude ${model} xatosi ${resp.status}: ${errText.slice(0, 180)}`);
      return null;
    }
    const data = (await resp.json()) as any;
    const text = (data?.content || [])
      .filter((b: any) => b?.type === 'text')
      .map((b: any) => b.text || '')
      .join('')
      .trim();
    if (!text) return null;
    return { text, model };
  } catch (err) {
    console.warn('[AI] Claude chaqiruv xatoligi:', (err as Error).message);
    return null;
  }
}

// ---------- SSE (streaming) imkoniyati ----------
type DeltaFn = (text: string) => void;

/** Claude stream: har bir content_block_delta matnini onDelta orqali uzatadi. */
async function streamClaude(
  message: string,
  context: string,
  model: string,
  history: ChatHistoryItem[],
  onDelta: DeltaFn
): Promise<string | null> {
  const key = config.ai.anthropicApiKey;
  if (!key) return null;
  const url = `${config.ai.anthropicEndpoint.replace(/\/$/, '')}/v1/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
    body: JSON.stringify({
      model,
      system: buildSystemPrompt(context),
      messages: [
        ...history.map((h) => ({
          role: h.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: h.content,
        })),
        { role: 'user' as const, content: message },
      ],
      max_tokens: config.ai.maxTokens,
      temperature: config.ai.temperature,
      stream: true,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok || !resp.body) {
    const errText = await resp.text().catch(() => '');
    console.warn(`[AI] Claude stream xatosi ${resp.status}: ${errText.slice(0, 180)}`);
    return null;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
            full += ev.delta.text;
            onDelta(ev.delta.text);
          }
          if (ev.type === 'error' && ev.error) {
            console.warn('[AI] Claude stream error:', JSON.stringify(ev.error).slice(0, 180));
            return null;
          }
        } catch {
          /* chunk parsin — ignor */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return full.trim() || null;
}

/** Gemini stream: SSE content blocklarni onDelta orqali uzatadi. */
async function streamGemini(
  message: string,
  context: string,
  model: string,
  history: ChatHistoryItem[],
  onDelta: DeltaFn
): Promise<string | null> {
  const key = config.ai.geminiApiKey;
  if (!key) return null;
  const body = {
    system_instruction: { parts: [{ text: buildSystemPrompt(context) }] },
    contents: [
      ...history.map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
      { role: 'user', parts: [{ text: message }] },
    ],
    generationConfig: { temperature: config.ai.temperature, maxOutputTokens: config.ai.maxTokens, candidateCount: 1 },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok || !resp.body) return null;
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const ev = JSON.parse(payload);
          const chunk = ev?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (typeof chunk === 'string' && chunk) {
            full += chunk;
            onDelta(chunk);
          }
        } catch {
          /* ignor */
        }
      }
    }
    return full.trim() || null;
  } catch (err) {
    console.warn('[AI] Gemini stream xatoligi:', (err as Error).message);
    return null;
  }
}

// ---------- Kontekst yig'ish ----------
// Global kontekst (xonalar/promo/yangiliklar/mavjudlik) DB'da kamdan-kam o'zgaradi,
// ammo HAR bir AI xabarida yana-yana o'qiladi. In-memory TTL cache per-message
// xarajatni sezilarli kamaytiradi (30 soniya yangilanishi yetarli).
const CONTEXT_TTL_MS = 30_000;
const contextCache = new Map<string, { value: string; expiresAt: number }>();

async function cachedContext(key: string, loader: () => Promise<string>): Promise<string> {
  const now = Date.now();
  const hit = contextCache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await loader();
  contextCache.set(key, { value, expiresAt: now + CONTEXT_TTL_MS });
  if (contextCache.size > 50) {
    // Eski yozuvlarni tozalash — xotira o'sishini cheklaydi
    contextCache.clear();
  }
  return value;
}

function formatPrice(n: number | string): string {
  return Number(n).toLocaleString('uz-UZ');
}

async function loadContext(): Promise<string> {
  const [rooms, promos, news, settingsRows] = await Promise.all([
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
    prisma.siteSetting.findMany({
      where: { key: { in: [...SITE_SETTING_KEYS] } },
      select: { key: true, value: true },
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

  // Sayt bilimlari (§6.16) — faqat admin panel orqali boshqariladigan DB yozuvlari ishlatiladi.
  const settings: Record<string, string> = {};
  for (const r of settingsRows) settings[r.key] = r.value;

  const faqLines = (settings.faq || '').split('\n').map((l) => l.trim()).filter(Boolean);

  const blocks: string[] = [
    'FAOL XONALAR:',
    roomLines.length ? roomLines.join('\n') : 'Hozircha faol xona yo\'q.',
    '',
    'PROMO-KODLAR:',
    promoLines.length ? promoLines.join('\n') : 'Hozircha faol promo-kod yo\'q.',
    '',
    'YANGILIKLAR:',
    newsLines.length ? newsLines.join('\n') : 'Hozircha yangilik yo\'q.',
  ];

  const siteBlocks: Array<[string, string]> = [
    ['ALOQA MA\'LUMOTLARI', [settings.contact_phone, settings.contact_email, settings.address].filter(Boolean).join('; ')],
    ['ISH VAQTI', settings.work_hours_note],
    ['TO\'LOV USULLARI', settings.payment_info],
    ['BEKOR QILISH SIYOSATI', settings.cancellation_policy],
    ['QANDAY BRON QILINADI', settings.how_to_book],
    ['FAQ', faqLines.join('\n')],
  ];

  for (const [title, text] of siteBlocks) {
    if (text && text.trim()) blocks.push('', `${title}:`, text);
  }

  if (!blocks.some((b) => b.includes('FAQ'))) blocks.push('', 'FAQ:', 'Admin hali FAQ\'ni kategoriyada yozmagan.');

  return blocks.join('\n');
}

/** Platforma konteksti — 30 soniyalik TTL cache (DB'ga har xabrda urilmaydi). */
function buildContext(): Promise<string> {
  return cachedContext('platform', loadContext);
}

function countWords(msg: string): number {
  return msg.trim().split(/\s+/).filter(Boolean).length;
}

// ---------- Bugungi jonli mavjudlik (AI bu ma'lumotni haqiqiy premium sifatida beradi) ----------
async function loadAvailabilityContext(): Promise<string> {
  const nowStr = tashkentNowHHMM();
  const nowMin = parseTime(nowStr) ?? 0;
  const rooms = await prisma.computerRoom.findMany({
    where: { status: 'ACTIVE' },
    select: {
      name: true,
      address: true,
      workingHours: true,
      zones: { select: { computers: { select: { status: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 4,
  });
  if (!rooms.length) return 'BUGUNGI MAVJUDLIK: hozircha faol xona yo\'q.';

  const lines = rooms.map((r) => {
    const wh = normalizeWorkingHours((r.workingHours as any) || null);
    const comps = (r.zones || []).flatMap((z) => z.computers || []);
    const freeNow = comps.filter((c) => c.status === 'AVAILABLE').length;
    const openLabel = minutesToHHMM(wh.open > 1440 ? wh.open - 1440 : wh.open);
    const closeLabel = wh.close % 1440 === 0 ? '24:00' : minutesToHHMM(wh.close);
    return `• ${r.name}${r.address ? ` (${r.address})` : ''} — hozir bo'sh kompyuterlar ${freeNow}/${comps.length}, ish vaqti ${openLabel}-${closeLabel}`;
  });

  return `BUGUNGI MAVJUDLIK (${nowStr} da):\n${lines.join('\n')}\n\n(Javobda "hozir bo'sh" degan raqamlarni faqat KONTEKSTDAN oling, ular vaqt o'tishi bilan o'zgaradi.)`;
}

/** Bugungi jonli mavjudlik — 30 soniyalik TTL cache (qiyin yuksaklikni kamaytiradi). */
function buildAvailabilityContext(): Promise<string> {
  return cachedContext('availability', loadAvailabilityContext);
}

// ---------- Foydalanuvchi shaxsiy konteksti (o'qish uchun, faqat o'zi haqida) ----------
async function buildUserContext(userId: string): Promise<string> {
  const [user, bookings, payments] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, phone: true, email: true, loyaltyBalance: true },
    }),
    prisma.booking.findMany({
      where: { userId, status: { in: ['PENDING', 'PENDING_PAYMENT', 'PARTIALLY_PAID', 'PAID', 'CONFIRMED', 'ACTIVE'] } },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        finalPrice: true,
        room: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: 10,
    }),
    prisma.payment.findMany({
      where: { userId, status: { in: ['PAID', 'COMPLETED', 'PENDING', 'REDIRECT_REQUIRED', 'PROCESSING'] } },
      select: { id: true, amount: true, status: true, method: true, createdAt: true, bookingId: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  if (!user) return 'Foydalanuvchi topilmadi.';

  const lines: string[] = [];
  if (user.fullName) lines.push(`Ism: ${user.fullName}`);
  if (user.phone) lines.push(`Telefon: ${user.phone}`);
  lines.push(`Bonus balansi: ${user.loyaltyBalance} ball (1 ball = 1 so'm)`);

  const bookingLines = bookings.map((b) => {
    const d = b.date ? String(b.date).slice(0, 10) : '?';
    return `• Bron #${b.id.slice(0, 8)} — ${b.room?.name || 'Xona'}, ${d} ${b.startTime}-${b.endTime}, holat: ${b.status}, narx: ${b.finalPrice} so'm`;
  });
  lines.push('Faol bronlar:');
  lines.push(bookingLines.length ? bookingLines.join('\n') : 'Faol bronlar yo\'q.');

  const paymentLines = payments.map((p) => {
    return `• To'lov #${p.id.slice(0, 8)} — ${p.amount} so'm, usul: ${p.method || '—'}, holat: ${p.status}, bron: ${p.bookingId.slice(0, 8)}`;
  });
  lines.push('So\x27nggi to\x27lovlar:');
  lines.push(paymentLines.length ? paymentLines.join('\n') : 'To\'lovlar topilmadi.');

  return lines.join('\n');
}

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

// ============ POST /api/ai/chat — AI yordamchi (auth talab qilinadi) ============
export const chat = async (req: AuthRequest, res: ExpressResponse, next: NextFunction) => {
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

    // 1) Platforma konteksti + foydalanuvchining o'z ma'lumotlari (faqat o'qish) + bugungi mavjudlik
    const [platform, userCtx, availability] = await Promise.all([
      buildContext(),
      buildUserContext(req.user!.userId),
      buildAvailabilityContext(),
    ]);
    const context =
      `===== FOYDALANUVCHI MA'LUMOTI =====\n${userCtx}\n\n` + platform + '\n\n' + availability;

    // 2) Haqiqiy LLM bilan javob berish: Claude (ustun) -> Gemini -> qoidaviy fallback
    let reply: string | null = null;
    let usedModel = 'fallback';
    if (config.ai.anthropicApiKey) {
      try {
        const result = await claudeChat(msg, context, config.ai.anthropicModel, hist);
        if (result) {
          reply = result.text;
          usedModel = result.model;
        }
      } catch (err) {
        console.warn('[AI] Claude chat xatoligi:', (err as Error).message);
      }
    }
    if (!reply) {
      try {
        const result = await geminiChat(msg, context, config.ai.model, hist);
        if (result) {
          reply = result.text;
          usedModel = result.model;
        }
      } catch (err) {
        console.warn('[AI] Gemini chat xatoligi:', (err as Error).message);
      }
    }

    // 3) Gemini ishlamasa — qoidaviy fallback
    if (!reply) {
      reply = await fallbackReply(msg, Number.isFinite(latN) ? latN : undefined, Number.isFinite(lngN) ? lngN : undefined);
    }

    return ok(res, { reply, model: usedModel });
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/ai/chat/stream — SSE (real-time streaming) ============
// Claude yoki Gemini'dan matnni bo'laklab uzatadi. Kalit so'rovda berilmaydi —
// server tomonida. Provider ishlamasa qoidaviy fallback bitta bo'lak sifatida.
export const chatStream = async (req: AuthRequest, res: ExpressResponse, next: NextFunction) => {
  try {
    const { message, history } = req.body as { message?: string; history?: unknown };
    const intro = `${INTRO}\n\nNarxlar, xonalar, ish vaqti, promo-kodlar va bron haqida so'rashingiz mumkin.`;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (payload: Record<string, unknown>) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

    if (!message || !message.trim()) {
      send({ delta: intro });
      send({ done: true, model: 'intro' });
      res.end();
      return;
    }

    const msg = message.trim().slice(0, 500);
    const hist = sanitizeHistory(history);
    const [platform, userCtx, availability] = await Promise.all([
      buildContext(),
      buildUserContext(req.user!.userId),
      buildAvailabilityContext(),
    ]);
    const context = `===== FOYDALANUVCHI MA'LUMOTI =====\n${userCtx}\n\n` + platform + '\n\n' + availability;

    let usedModel = 'fallback';
    let streamed: string | null = null;

    if (config.ai.anthropicApiKey) {
      try {
        streamed = await streamClaude(msg, context, config.ai.anthropicModel, hist, (t) => send({ delta: t }));
        if (streamed) usedModel = config.ai.anthropicModel;
      } catch (err) {
        console.warn('[AI] chatStream Claude xatoligi:', (err as Error).message);
      }
    }
    if (!streamed && config.ai.geminiApiKey) {
      try {
        streamed = await streamGemini(msg, context, config.ai.model, hist, (t) => send({ delta: t }));
        if (streamed) usedModel = config.ai.model;
      } catch (err) {
        console.warn('[AI] chatStream Gemini xatoligi:', (err as Error).message);
      }
    }
    if (!streamed) {
      const fallback = await fallbackReply(msg);
      send({ delta: fallback });
    }

    send({ done: true, model: usedModel });
    res.end();
  } catch (err) {
    console.error('[AI] chatStream:', (err as Error).message);
    try {
      if (!res.headersSent) res.status(500);
      res.write(`data: ${JSON.stringify({ error: 'chat failed', done: true })}\n\n`);
      res.end();
    } catch {
      next(err as Error);
    }
  }
};

// ============ SUHBAT DAVOMIY GENERATORI (conversations API uchun) ============
// Suhbat tarixi DB (AIMessage) dan yig'iladi — frontend history bilan aralashtirilmaydi.
export async function generateAIReply(
  userId: string,
  message: string,
  history: ChatHistoryItem[],
  lat?: number,
  lng?: number
): Promise<{ reply: string; model: string }> {
  const [platform, userCtx, availability] = await Promise.all([
    buildContext(),
    buildUserContext(userId),
    buildAvailabilityContext(),
  ]);
  const context = `===== FOYDALANUVCHI MA'LUMOTI =====\n${userCtx}\n\n` + platform + '\n\n' + availability;

  let reply: string | null = null;
  let usedModel = 'fallback';
  if (config.ai.anthropicApiKey) {
    try {
      const result = await claudeChat(message, context, config.ai.anthropicModel, history);
      if (result) {
        reply = result.text;
        usedModel = result.model;
      }
    } catch (err) {
      console.warn('[AI] generateAIReply Claude xatoligi:', (err as Error).message);
    }
  }
  if (!reply) {
    try {
      const result = await geminiChat(message, context, config.ai.model, history);
      if (result) {
        reply = result.text;
        usedModel = result.model;
      }
    } catch (err) {
      console.warn('[AI] generateAIReply Gemini xatoligi:', (err as Error).message);
    }
  }

  if (!reply) {
    reply = await fallbackReply(message, Number.isFinite(lat) ? lat : undefined, Number.isFinite(lng) ? lng : undefined);
  }

  return { reply, model: usedModel };
}

/** AIMessage[] ni Gemini uchun suhbat tarixiga o'tkazadi (so'nggi 8 ta). */
export function conversationToHistory(messages: Array<{ role: string; content: string }>): ChatHistoryItem[] {
  return messages
    .slice(-8)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
}

// ============ SUHBAT DAVOMIY GENERATORI — REAL-TIME STREAMING ============
// generateAIReply'ning streaming varianti: Claude stream -> Gemini stream -> qoidaviy
// fallback (bitta delta bo'lim sifatida). Har bir token onDelta orqali uzatiladi.
export async function streamAIReply(
  userId: string,
  message: string,
  history: ChatHistoryItem[],
  onDelta: DeltaFn
): Promise<{ text: string; model: string }> {
  const [platform, userCtx, availability] = await Promise.all([
    buildContext(),
    buildUserContext(userId),
    buildAvailabilityContext(),
  ]);
  const context = `===== FOYDALANUVCHI MA'LUMOTI =====\n${userCtx}\n\n` + platform + '\n\n' + availability;

  let text: string | null = null;
  let usedModel = 'fallback';
  if (config.ai.anthropicApiKey) {
    try {
      text = await streamClaude(message, context, config.ai.anthropicModel, history, onDelta);
      if (text) usedModel = config.ai.anthropicModel;
    } catch (err) {
      console.warn('[AI] streamAIReply Claude xatoligi:', (err as Error).message);
    }
  }
  if (!text && config.ai.geminiApiKey) {
    try {
      text = await streamGemini(message, context, config.ai.model, history, onDelta);
      if (text) usedModel = config.ai.model;
    } catch (err) {
      console.warn('[AI] streamAIReply Gemini xatoligi:', (err as Error).message);
    }
  }
  if (!text) {
    text = await fallbackReply(message);
    if (text) onDelta(text);
  }
  return { text: text || 'Xatolik yuz berdi. Yana urinib ko\'ring.', model: usedModel };
}