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

const INTRO = 'Men Cyber-ZONE AI yordamchisiman';

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

  const system = buildSystemPrompt(context);

  const body = {
    system_instruction: { parts: [{ text: system }] },
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
      parts: [{ text: buildSystemPrompt(context) }],
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
//
// AI UMUMIY YORDAMCHI: saytga bog'liq savollarga KONTEKSTDAN javob beradi,
// qolgan BARCHA savollarga (umumiy bilim, dasturlash, matematika, ta'lim,
// kundalik maslahat, tarjima, yozish va h.k.) o'z bilimi bilan to'liq javob
// beradi. "Faqat sayt haqida" deb cheklov yo'q.
function buildSystemPrompt(context: string): string {
  return [
    'Sen Cyber-ZONE — kompyuter xona (gaming club) platformasining AI yordamchisisan.',
    '',
    'ASOSIY QO\'RIDA: Sen UMUMIY sun\'iy intellekt yordamchisisan. Foydalanuvchi senga HECH QANDAY savol bersa ham to\'liq va aniq javob ber.',
    '  • Saytga oid savollar (narx, ish vaqti, xonalar, promo-kod, bron, mening balansim/to\'lovlarim) — quyidagi KONTEKSTDAN javob ber.',
    '  • Boshqa BARCHA savollar (ta\'lim, fan, dasturlash, matematika, tarix, sport, maslahat, tarjima, matn yozish, kod, g\'oya) — o\'z biliming bilan to\'liq javob ber. "Ma\'lumotim yo\'q" deb rad etma, qisqartirib ham bo\'lma.',
    '  • Savol noaniq bo\'lsa, taxmin qilmasdan ANIQ bir qisqa savol bilan aniqlash so\'ra.',
    '',
    'O\'ZBEK TILI: Foydalanuvchiga o\'zbek tilida, do\'stona va aniq javob ber. Kerakli joyda emojilar ishlat.',
    'Foydalanuvchi ruscha yoki inglizcha yozsa — o\'sh tilda javob ber.',
    '',
    'ANIQLIK (bu qoidalar buzilmaydi):',
    '  • Narx, ish vaqti, xona ro\'yxati, promo-kod, mavjudlik, aloqa ma\'lumotlari — FAQAT KONTEKSTDAN. U yerda yo\'q bo\'lsa "hozircha ma\'lumot yo\'q" de. Xotiradan yoki taxmin qilib narx aytma.',
    '  • Foydalanuvchining shaxsiy ma\'lumotlari (bron, to\'lov, bonus balans, qarz) — FAQAT "FOYDALANUVCHI MA\'LUMOTI" bo\'limidan. U yerda yo\'q narsani uydirma.',
    '  • Bronni o\'zi tasdiqlamaysan, to\'lovni muvaffaqiyatli deb aytmaysan, tasdiqlanmagan holatni "bajarildi" deb ko\'rsatmaysan — bular platforma tomonda tekshiriladi.',
    '  • "FOYDALANUVCHI/ADMIN/PLATFORMA" bo\'limlari — shu suhbatdoshga SERVER tomonidan berilgan yagona ma\'lumot. Boshqa foydalanuvchilar haqida ma\'lumot senga kelmagan: uydirmasan va boshqasining ma\'lumotini oshkora qilmasan.',
    '',
    'QULAY YORDAM:',
    '  • Bron qilish qadamlari: 1) xona sahifasi, 2) sana/vaqt/zonani tanlash, 3) promo-kod (agar bo\'lsa), 4) to\'lov (Click/PayMe/Uzum/Paynet/karta orqali o\'tkazma/naqd), 5) tasdiqlash.',
    '  • Sayt sahifalarini /rooms, /chat, /profile, /news, /checkout shaklida ko\'rsat.',
    '  • Javobni 3-6 qisqa paragraf yoki ro\'yxat shaklida yoz, uzun bo\'lmasin.',
    '',
    '===== PLATFORMA KONTEKSTI =====',
    context,
  ].join('\n');
}

/** Claude Messages API orqali yagona (streamsiz) javob. Kalit yo'q bo'lsa — null. */
/**
 * OpenAI-compatible provider (chat/completions).
 *
 * Nima uchun alohida funksiya: OpenAI, Groq, Together, OpenRouter, vLLM,
 * LM Studio, Ollama — hammasi shu biri formatda ishlaydi. Ya'ni bitta
 * kalit + bitta base URL bilan istalgan provider'ni ulash mumkin.
 * Kalit yo'q bo'lsa — null qaytaradi, zanjirdagi keyingi bosqichga o'tadi.
 */
async function openaiChat(
  message: string,
  context: string,
  model: string,
  history: ChatHistoryItem[]
): Promise<{ text: string; model: string } | null> {
  const key = config.ai.openaiApiKey;
  if (!key) return null;

  const base = config.ai.openaiBaseUrl.replace(/\/$/, '');
  const url = `${base}/chat/completions`;
  const body = {
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt(context) },
      ...history.map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
      { role: 'user', content: message },
    ],
    max_tokens: config.ai.maxTokens,
    temperature: config.ai.temperature,
  };

  try {
    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.warn(`[AI] OpenAI-compatible ${model} xatosi ${resp.status}: ${errText.slice(0, 180)}`);
      return null;
    }
    const data = (await resp.json()) as any;
    const text = (data?.choices?.[0]?.message?.content || '').toString().trim();
    if (!text) return null;
    return { text, model };
  } catch (err) {
    console.warn('[AI] OpenAI-compatible chaqiruv xatoligi:', (err as Error).message);
    return null;
  }
}

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

// ---------- Provider boshqaruvi (yagona zanjir) ----------
// Eski kodda cascade 4 joyda (chat, chatStream, generateAIReply, streamAIReply)
// takrorlanган edi — tartib/bu zanjirdan chiqish joyini ko'paytiradi. Endi
// bitta dispatcher bor: AI_PROVIDER (auto|anthropic|gemini|openai) va AI_MODEL
// shu yerda qo'llanadi. Orqaga moslik: AI_PROVIDER o'rnatilmasa avvalgi tartib.
type LlmProvider = 'anthropic' | 'gemini' | 'openai';
const PROVIDER_BASE_ORDER: LlmProvider[] = ['anthropic', 'gemini', 'openai'];

function providerOrder(): LlmProvider[] {
  const pref = config.ai.provider as LlmProvider;
  return PROVIDER_BASE_ORDER.includes(pref)
    ? [pref, ...PROVIDER_BASE_ORDER.filter((p) => p !== pref)]
    : [...PROVIDER_BASE_ORDER];
}

function hasProviderKey(p: LlmProvider): boolean {
  if (p === 'anthropic') return Boolean(config.ai.anthropicApiKey);
  if (p === 'gemini') return Boolean(config.ai.geminiApiKey);
  return Boolean(config.ai.openaiApiKey);
}

function modelFor(p: LlmProvider): string {
  if (config.ai.modelOverride) return config.ai.modelOverride;
  if (p === 'anthropic') return config.ai.anthropicModel;
  if (p === 'gemini') return config.ai.model;
  return config.ai.openaiModel;
}

interface DispatchArgs {
  message: string;
  context: string;
  history: ChatHistoryItem[];
  /** Berilsa — streaming rejim (faqat Claude/Gemini stream qo'llaydi). */
  onDelta?: DeltaFn;
}
interface DispatchResult {
  reply: string | null;
  model: string;
  /** Stream ortiqcha matn uzatilgan — keyingi provider/fallback ISHLATILMAYDI (dublikat oldini olish). */
  aborted?: boolean;
}

/**
 * LLM cascade'ni bajaradi: AI_PROVIDER tartibida har bir kalitli provider'ga
 * uriladi, javob bo'lsa to'xtaydi. Hech qanday kalit/-provider ishlamasa
 * reply=null — chaqiruvchi qoidaviy fallback'ni o'zi chaqiradi.
 */
async function dispatchChat(args: DispatchArgs): Promise<DispatchResult> {
  const { message, context, history, onDelta } = args;
  for (const p of providerOrder()) {
    if (!hasProviderKey(p)) continue;
    const model = modelFor(p);
    if (onDelta) {
      // streamClaude/streamGemini ichki xatoda null qaytarishi mumkin —
      // lekin qisman matn allaqachon uzatilgan bo'lishi mumkin.
      let emitted = false;
      const wrapped: DeltaFn = (t) => { emitted = true; onDelta(t); };
      try {
        const text =
          p === 'anthropic'
            ? await streamClaude(message, context, model, history, wrapped)
            : await streamGemini(message, context, model, history, wrapped);
        if (text) return { reply: text, model };
        if (emitted) return { reply: null, model, aborted: true };
      } catch (err) {
        console.warn(`[AI] ${p} stream xatoligi:`, (err as Error).message);
        if (emitted) return { reply: null, model, aborted: true };
      }
    } else {
      try {
        const result =
          p === 'anthropic'
            ? await claudeChat(message, context, model, history)
            : p === 'gemini'
              ? await geminiChat(message, context, model, history)
              : await openaiChat(message, context, model, history);
        if (result) return { reply: result.text, model: result.model };
      } catch (err) {
        console.warn(`[AI] ${p} chat xatoligi:`, (err as Error).message);
      }
    }
  }
  return { reply: null, model: 'fallback' };
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

// ---------- Rollarga qarab kontekst (server tomonidagi ma'lumot chegarasi) ----------
// Xavfsizlik qoidasi: foydalanuvchining RO'LIGI serverda tekshiriladi va
// shu tekshiruvdan keyingina kontekstga qo'shimcha bo'limlar qo'shiladi.
// USER hech qachon boshqa foydalanuvchining yoki boshqa xonaning ma'lumotini
// ko'rmaydi; ADMIN faqat o'z xonalari bo'yicha navbatni ko'radi;
// SUPER_ADMIN faqat agregatlar (sanamalar) oladi — LLM hech narsani "kengaytira" olmaydi.

async function adminOwnedContext(ownerId: string): Promise<string> {
  const rooms = await prisma.computerRoom.findMany({
    where: { ownerId },
    select: { id: true, name: true, status: true },
    take: 30,
  });
  if (!rooms.length) return '';
  const roomIds = rooms.map((r) => r.id);

  const [pendingBookings, pendingPayments, todayCount] = await Promise.all([
    prisma.booking.findMany({
      where: { roomId: { in: roomIds }, status: { in: ['PENDING', 'PENDING_PAYMENT', 'PARTIALLY_PAID'] } },
      select: { id: true, date: true, startTime: true, endTime: true, status: true, finalPrice: true, room: { select: { name: true } } },
      orderBy: { date: 'asc' },
      take: 6,
    }),
    prisma.payment.findMany({
      where: { booking: { roomId: { in: roomIds } }, status: 'PENDING' },
      select: { id: true, amount: true, method: true, createdAt: true, proofSubmittedAt: true, bookingId: true },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    prisma.booking.count({
      where: { roomId: { in: roomIds }, date: new Date(new Date().toISOString().slice(0, 10)) },
    }),
  ]);

  const lines: string[] = [];
  lines.push(`Xonalarim (${rooms.length}): ${rooms.map((r) => `${r.name} [${r.status}]`).join(', ')}`);
  lines.push(`Bugungi bronlar: ${todayCount}`);
  lines.push('Kutilayotgan bronlar:');
  lines.push(
    pendingBookings.length
      ? pendingBookings
          .map((b) => `• #${b.id.slice(0, 8)} — ${b.room?.name}, ${String(b.date).slice(0, 10)} ${b.startTime}-${b.endTime}, holat: ${b.status}, ${b.finalPrice} so'm`)
          .join('\n')
      : 'Yo\'q.'
  );
  lines.push('Tasdiqlanmagan (PENDING) to\'lovlar:');
  lines.push(
    pendingPayments.length
      ? pendingPayments
          .map((p) => `• #${p.id.slice(0, 8)} — ${p.amount} so'm, usul: ${p.method || '—'}, chek yuborilgan: ${p.proofSubmittedAt ? 'ha' : 'yo\'q'}, bron: ${p.bookingId.slice(0, 8)}`)
          .join('\n')
      : 'Yo\'q.'
  );
  return lines.join('\n');
}

async function superAdminContext(): Promise<string> {
  const startOfDay = new Date(new Date().toISOString().slice(0, 10));
  const [statusGroups, pendingPayments, todayBookings, userCount, paidAgg] = await Promise.all([
    prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.payment.findMany({
      where: { status: 'PENDING' },
      select: { id: true, amount: true, method: true, proofSubmittedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.booking.count({ where: { date: startOfDay } }),
    prisma.user.count(),
    prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
  ]);

  const lines: string[] = [];
  lines.push(`Jami foydalanuvchilar: ${userCount}`);
  lines.push(`Bugungi bronlar: ${todayBookings}`);
  lines.push(`Bronlar holati bo'yicha: ${statusGroups.map((g) => `${g.status}=${g._count._all}`).join(', ')}`);
  lines.push(`Tasdiqlangan jami tushum: ${paidAgg._sum.amount ?? 0} so'm`);
  lines.push('Tasdiqlanmagan to\'lovlar navbati:');
  lines.push(
    pendingPayments.length
      ? pendingPayments
          .map((p) => `• #${p.id.slice(0, 8)} — ${p.amount} so'm, usul: ${p.method || '—'}, chek yuborilgan: ${p.proofSubmittedAt ? 'ha' : 'yo'}`)
          .join('\n')
      : 'Yo\'q.'
  );
  return lines.join('\n');
}

/**
 * Suhbatdoshning ro'li asosida kontekst yig'adi (YAGONA kirish nuqtasi).
 * `buildUserContext` doim shaxsiy (faqat o'zi) qismni beradi; qo'shimcha
 * ADMIN/SUPER_ADMIN bo'limlari faqat DB'dagi roli mos bo'lgandagina qo'shiladi.
 */
export async function buildRoleContext(userId: string): Promise<string> {
  const personal = await buildUserContext(userId);
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const role = actor?.role ?? 'USER';

  if (role === 'SUPER_ADMIN') {
    const stats = await superAdminContext();
    return `${personal}\n\n===== PLATFORMA STATISTIKASI (SUPER_ADMIN) =====\n${stats}`;
  }
  if (role === 'ADMIN') {
    const owned = await adminOwnedContext(userId);
    if (owned) {
      return `${personal}\n\n===== BOSHQARUV KONTEKSTI (ADMIN — faqat o'z xonalari) =====\n${owned}`;
    }
  }
  return personal;
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

/** Hech qanday LLM kaliti yo'q — foydalanuvchiga halol aytamiz (yashirmaymiz). */
const AI_NOT_CONFIGURED =
  'AI yordamchi hozircha texnik nosozlikda: sun\'iy intellekt kaliti serverga o\'rnatilmagan, shuning uchun men har qanday savolga to\'liq javob bera olmayapman. ' +
  'Hozircha quyidagilarda yordam bera olaman: narxlar, ish vaqti, xonalar, promo-kodlar va bron qilish. Administratorga xabar bering — muammo tez orada tuzatiladi.';

async function fallbackReply(message: string, lat?: number, lng?: number): Promise<string> {
  const intent = detectFallbackIntent(message);

  // Saytga oid aniq savollarga DB'dan halol javob beramiz (kalit kerak emas).
  // Qolgani — kalitsiz javob mumkin emas, uni yashirmaslik uchun ochiq aytamiz.
  if (!config.ai.anthropicApiKey && !config.ai.geminiApiKey && !config.ai.openaiApiKey && intent !== 'greeting' && intent !== 'thanks' && intent !== 'bye') {
    if (intent === 'promo' || intent === 'prices' || intent === 'working_hours' || intent === 'nearest' || intent === 'search_rooms' || intent === 'booking') {
      // quyidagi DB-qisimlar ishlaydi
    } else {
      return AI_NOT_CONFIGURED;
    }
  }

  if (intent === 'greeting') {
    return countWords(message) <= 3
      ? `${INTRO}\n\nSalom! Savolingizni yozing — masalan "narxlar qanday", "yaqin xonalari ko'rsat" yoki boshqa har qanday savol.`
      : 'Salom! Xonalar, narxlar, bron qilish va promo-kodlar bo\'yicha yordam bera olaman. Nima bilmoqchisiz?';
  }
  if (intent === 'thanks') return 'Arzimaydi! Boshqa savolingiz bo\'lsa, bemalol so\'rang.';
  if (intent === 'bye') return 'Xayr! Tashrifingiz uchun rahmat. Yana keling!';

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

  return `Kechirasiz, buni aniq tushunmadim. Savolingizni biroz boshqacha yozib ko'ring.`;
}

// ============ GET /api/ai/status — AI yordamchining holati (diagnostika) ============
// Yordamchi "hammasiga javob bermayapti" degan muammoning eng tez tekshiriladigan
// sababi — serverda API kaliti yo'q. Shu sabab bu endpoint faqat RO'YXAT QILADI:
// kalitlarning qaysilari o'rnatilgan, qaysi model ishlatiladi, real LLM bormi.
// Hech qanday kalit qiymati QAYTARILMAYDI.
export const getAiStatus = async (_req: AuthRequest, res: ExpressResponse, next: NextFunction) => {
  try {
    const hasClaude = Boolean(config.ai.anthropicApiKey);
    const hasGemini = Boolean(config.ai.geminiApiKey);
    const hasOpenAI = Boolean(config.ai.openaiApiKey);
    const live = hasClaude
      ? config.ai.anthropicModel
      : hasGemini
        ? config.ai.model
        : hasOpenAI
          ? config.ai.openaiModel
          : null;
    const order = providerOrder();
    return ok(res, {
      live: Boolean(live),
      activeModel: live,
      fallbackOnly: !live,
      // AI_PROVIDER: 'auto' = Claude -> Gemini -> OpenAI; aks holda tanlangan
      // provider birinchi uriladi (AI_MODEL — model nomini majburlash uchun).
      provider: config.ai.provider,
      providerOrder: order,
      modelOverride: config.ai.modelOverride || null,
      providers: {
        claude: { configured: hasClaude, model: config.ai.anthropicModel },
        gemini: { configured: hasGemini, model: config.ai.model, fallbackModel: config.ai.fallbackModel },
        openai: { configured: hasOpenAI, model: config.ai.openaiModel, baseUrl: config.ai.openaiBaseUrl },
      },
      limits: { maxTokens: config.ai.maxTokens, temperature: config.ai.temperature },
      hint: live
        ? null
        : "AI yordamchi qoidaviy (oddiy) javoblar bilan ishlayapti. Render dashboard'ga ANTHROPIC_API_KEY, GEMINI_API_KEY yoki OPENAI_API_KEY (bittasi yetarli) qo'ying va xizmatni qayta ishga tushiring — shundan keyin AI barcha savollarga to'liq javob beradi.",
    });
  } catch (err) {
    next(err);
  }
};

// ============ POST /api/ai/chat — AI yordamchi (auth talab qilinadi) ============
export const chat = async (req: AuthRequest, res: ExpressResponse, next: NextFunction) => {
  try {
    const { message, history } = req.body as { message?: string; history?: unknown; lat?: number; lng?: number };
    if (!message || !message.trim()) {
      return ok(res, { reply: `${INTRO}\n\nSavolingizni yozing — sayt bo'yicha (narx, xonalar, ish vaqti, promo-kod, bron) va boshqa har qanday savolga to'liq javob beraman.` });
    }

    // Xarajat himoyasi: xabarni cheklaymiz
    const msg = message.trim().slice(0, 500);
    const hist = sanitizeHistory(history);
    const { lat, lng } = req.query as { lat?: string; lng?: string };
    const latN = Number(lat);
    const lngN = Number(lng);

    // 1) Platforma konteksti + suhbatdoshning shaxsiy/rolli konteksti (faqat o'qish)
    //    + bugungi mavjudlik. Rolli kontekst SERVERDA cheklanadi (buildRoleContext).
    const [platform, userCtx, availability] = await Promise.all([
      buildContext(),
      buildRoleContext(req.user!.userId),
      buildAvailabilityContext(),
    ]);
    const context =
      `===== FOYDALANUVCHI MA'LUMOTI =====\n${userCtx}\n\n` + platform + '\n\n' + availability;

    // 2) Haqiqiy LLM: AI_PROVIDER tartibida (auto: Claude -> Gemini -> OpenAI)
    const dispatched = await dispatchChat({ message: msg, context, history: hist });

    // 3) Hech qanday provider javob bermasa — qoidaviy fallback
    const reply =
      dispatched.reply ??
      (await fallbackReply(msg, Number.isFinite(latN) ? latN : undefined, Number.isFinite(lngN) ? lngN : undefined));

    return ok(res, { reply, model: dispatched.model });
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
    const intro = `${INTRO}\n\nSavolingizni yozing — sayt bo'yicha (narx, xonalar, ish vaqti, promo-kod, bron) va boshqa har qanday savolga to'liq javob beraman.`;

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
      buildRoleContext(req.user!.userId),
      buildAvailabilityContext(),
    ]);
    const context = `===== FOYDALANUVCHI MA'LUMOTI =====\n${userCtx}\n\n` + platform + '\n\n' + availability;

    const streamed = await dispatchChat({ message: msg, context, history: hist, onDelta: (t) => send({ delta: t }) });

    // aborted=true — matn qisman uzatilgan (dublikat bo'lmasligi uchun fallback YO'Q)
    if (!streamed.reply && !streamed.aborted) {
      const fallback = await fallbackReply(msg);
      send({ delta: fallback });
    }

    send({ done: true, model: streamed.model });
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
    buildRoleContext(userId),
    buildAvailabilityContext(),
  ]);
  const context = `===== FOYDALANUVCHI MA'LUMOTI =====\n${userCtx}\n\n` + platform + '\n\n' + availability;

  const dispatched = await dispatchChat({ message, context, history });
  const reply =
    dispatched.reply ??
    (await fallbackReply(message, Number.isFinite(lat) ? lat : undefined, Number.isFinite(lng) ? lng : undefined));

  return { reply, model: dispatched.model };
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
    buildRoleContext(userId),
    buildAvailabilityContext(),
  ]);
  const context = `===== FOYDALANUVCHI MA'LUMOTI =====\n${userCtx}\n\n` + platform + '\n\n' + availability;

  const dispatched = await dispatchChat({ message, context, history, onDelta });
  let text = dispatched.reply;
  if (!text && !dispatched.aborted) {
    text = await fallbackReply(message);
    if (text) onDelta(text);
  }
  return { text: text || 'Xatolik yuz berdi. Yana urinib ko\'ring.', model: dispatched.model };
}