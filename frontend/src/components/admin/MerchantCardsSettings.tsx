'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, AlertCircle, CreditCard, Copy, Check, Info, Eye, EyeOff } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { toastError, toastSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';

/**
 * Har bir to'lov usuli uchun ALOHIDA dogaon (merchant) karta.
 *
 * Nima uchun bitta emas, ko'p: Uzum orqali to'lov VISA kartaga, UzCard
 * orqali o'z kartasiga tushadi. Foydalanuvchi noto'g'ri kartaga o'tkazsa,
 * bank hisobini solishtirib bo'lmaydi va to'lov tasdiqlanmay qoladi.
 *
 * Saqlanishi: `payment_cards_by_method` kaliti ostida JSON
 * (backend `utils/merchantCards.ts` shu JSON'ni o'qiydi).
 */

type CardKey = 'number' | 'holder' | 'bank' | 'note' | 'appUrl';
type CardMap = Record<string, Partial<Record<CardKey, string>>>;

/** Usul -> nechta raqamli karta (UI bo'sh joyni to'g'ri ko'rsatishi uchun). */
const METHOD_META: { key: string; label: string; digits: number; hint: string }[] = [
  { key: 'UZUM', label: 'Uzum', digits: 16, hint: 'Uzum orqali to\'lov shu kartaga tushadi (VISA)' },
  { key: 'PAYME', label: 'Payme', digits: 16, hint: 'Payme orqali to\'lov shu kartaga tushadi' },
  { key: 'CLICK', label: 'Click', digits: 16, hint: 'Click orqali to\'lov shu kartaga tushadi' },
  { key: 'PAYNET', label: 'Paynet', digits: 16, hint: 'Paynet orqali to\'lov shu kartaga tushadi' },
  { key: 'DEFAULT', label: 'Barcha usullar uchun zaxira', digits: 16, hint: 'Yuqoridagilar bo\'sh bo\'lsa shu ishlatiladi' },
];

/**
 * Usul -> «Ilovaga o'tib to'lash» tugmasi qayerda ochiladi.
 * Admin paneldagi `appUrl` bo'sh bo'lsa shu zaxira ishlatiladi.
 */
const DEFAULT_APP_URL: Record<string, string> = {
  UZUM: 'https://www.uzumcheckout.uz',
  PAYME: 'https://payme.uz',
  CLICK: 'https://click.uz',
  PAYNET: 'https://paynet.uz',
  DEFAULT: '',
};

const EMPTY: CardMap = {};

function parseCards(raw: string | undefined): CardMap {
  if (!raw) return { ...EMPTY };
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return v as CardMap;
  } catch {
    return {};
  }
}

function field(set: (next: CardMap) => void, map: CardMap, method: string, key: CardKey, value: string) {
  set({
    ...map,
    [method]: { ...(map[method] || {}), [key]: value },
  });
}

/** 4 xonalik guruhlash: 0000 0000 0000 0000 (maks 19 raqam). */
function formatCardNumber(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** Yashirilgan ko'rinish — faqat oxirgi 4 raqam ochiq qoladi. */
function maskCardNumber(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (d.length <= 4) return '••••';
  return `•••• •••• •••• ${d.slice(-4)}`;
}

export default function MerchantCardsSettings() {
  const [cards, setCards] = useState<CardMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api
      // Admin endpoint — karta kalitlari ommaviy GET'da yashirilgan.
      .get('/api/settings/site/admin')
      .then(({ data }) => {
        const s = (data?.data?.settings as Record<string, string> | undefined) || {};
        setCards(parseCards(s.payment_cards_by_method));
      })
      .catch(() => setCards({}))
      .finally(() => setLoading(false));
  }, []);

  const filled = useMemo(
    () => METHOD_META.filter((m) => (cards[m.key]?.number || '').trim()).length,
    [cards]
  );

  async function save() {
    setSaving(true);
    try {
      // Bo'sh raqamli usullarni butunlay tashlaymiz — JSON toza qoladi.
      const clean: CardMap = {};
      for (const m of METHOD_META) {
        const c = cards[m.key];
        if (!c || !(c.number || '').trim()) continue;
        clean[m.key] = {
          number: (c.number || '').replace(/\s+/g, ''),
          holder: (c.holder || '').trim(),
          bank: (c.bank || '').trim(),
          note: (c.note || '').trim(),
          appUrl: (c.appUrl || DEFAULT_APP_URL[m.key] || '').trim(),
        };
      }
      const { data } = await api.put('/api/settings/site', {
        value: { payment_cards_by_method: JSON.stringify(clean) },
      });
      const s = (data?.data?.settings as Record<string, string> | undefined) || {};
      setCards(parseCards(s.payment_cards_by_method));
      toastSuccess("To'lov kartalari saqlandi");
    } catch (err) {
      toastError(getApiErrorMessage(err, 'Kartalarni saqlashda xatolik'));
    } finally {
      setSaving(false);
    }
  }

  function copyNumber(method: string, number: string) {
    navigator.clipboard
      .writeText(number.replace(/\s+/g, ''))
      .then(() => {
        setCopied(method);
        setTimeout(() => setCopied((v) => (v === method ? null : v)), 1500);
      })
      .catch(() => toastError("Karta raqamini nusxalab bo'lmadi"));
  }

  if (loading) {
    return (
      <div className="surface rounded-2xl p-6 text-center text-gray-400 text-sm">
        <Loader2 size={18} className="inline animate-spin mr-2" /> Yuklanmoqda...
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-neon-cyan/5 border border-neon-cyan/20 text-xs text-gray-300 mb-5">
        <Info size={14} className="text-neon-cyan shrink-0 mt-0.5" />
        <span>
          Foydalanuvchi to&apos;lovni tanlaganda faqat <b>o&apos;sha usulning</b> kartasi ko&apos;rsatiladi.
          Masalan Uzum tanlansa — Uzum kartasi, UzCard tanlansa — UzCard kartasi.
          Bo&apos;sh usul uchun «Barcha usullar uchun zaxira» ishlatiladi.
          <br />
          Hozir to&apos;ldirilgan: <b>{filled}</b>/{METHOD_META.length}.
        </span>
      </div>

      <div className="space-y-3">
        {METHOD_META.map((m) => {
          const c = cards[m.key] || {};
          const has = (c.number || '').trim().length > 0;
          return (
            <div
              key={m.key}
              className={cn(
                'rounded-2xl border p-4',
                has ? 'border-neon-green/30 bg-neon-green/[0.04]' : 'border-white/10 surface'
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <CreditCard size={15} className={has ? 'text-neon-green' : 'text-gray-500'} />
                  <span className="text-sm font-bold">{m.label}</span>
                  {has ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neon-green/15 text-neon-green border border-neon-green/25 font-bold uppercase">
                      sozlangan
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-500 border border-white/10 font-bold uppercase">
                      bo&apos;sh
                    </span>
                  )}
                </div>
                {has && (
                  <button
                    type="button"
                    onClick={() => copyNumber(m.key, c.number || '')}
                    title="Nusxalash (tekshirish uchun)"
                    className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-neon-cyan"
                  >
                    {copied === m.key ? <Check size={12} /> : <Copy size={12} />}
                    {copied === m.key ? 'Nusxalandi' : 'Nusxala'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block sm:col-span-2">
                  <span className="block text-[11px] text-gray-400 mb-1">Karta raqami</span>
                  <div className="flex items-center gap-2">
                    <input
                      value={revealed[m.key] ? formatCardNumber(c.number || '') : maskCardNumber(c.number || '')}
                      onFocus={() => setRevealed((r) => ({ ...r, [m.key]: true }))}
                      onBlur={() => setRevealed((r) => ({ ...r, [m.key]: false }))}
                      onChange={(e) => {
                        if (!revealed[m.key]) return;
                        field(setCards, cards, m.key, 'number', formatCardNumber(e.target.value));
                      }}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0000 0000 0000 0000"
                      className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm font-mono tracking-widest outline-none focus:border-neon-cyan/40"
                    />
                    <button
                      type="button"
                      onClick={() => setRevealed((r) => ({ ...r, [m.key]: !r[m.key] }))}
                      aria-label={revealed[m.key] ? 'Raqamni yashirish' : 'Raqamni ko\'rsatish'}
                      className="inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-neon-cyan hover:border-neon-cyan/30 transition-colors"
                    >
                      {revealed[m.key] ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </label>
                <label className="block">
                  <span className="block text-[11px] text-gray-400 mb-1">Karta egasi (ism-familiya)</span>
                  <input
                    value={c.holder || ''}
                    onChange={(e) => field(setCards, cards, m.key, 'holder', e.target.value)}
                    maxLength={120}
                    className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none focus:border-neon-cyan/40"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] text-gray-400 mb-1">Bank</span>
                  <input
                    value={c.bank || ''}
                    onChange={(e) => field(setCards, cards, m.key, 'bank', e.target.value)}
                    maxLength={120}
                    placeholder="TESTBANK, UzCard, ..."
                    className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none focus:border-neon-cyan/40"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="block text-[11px] text-gray-400 mb-1">
                    Ilova havolasi <span className="text-gray-600">— ixtiyoriy</span>
                  </span>
                  <input
                    value={c.appUrl || ''}
                    onChange={(e) => field(setCards, cards, m.key, 'appUrl', e.target.value)}
                    maxLength={400}
                    placeholder={DEFAULT_APP_URL[m.key] || 'https://...'}
                    className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none focus:border-neon-cyan/40"
                  />
                  <span className="block mt-1 text-[11px] text-gray-500">
                    Mijoz karta raqamini nusxalagandan keyin «Ilovaga o&apos;tib to&apos;lash» tugmasi shu
                    havolani ochadi. Bo&apos;sh qoldirilsa — usulga xos standart havola ishlatiladi
                    {DEFAULT_APP_URL[m.key] ? ` (${DEFAULT_APP_URL[m.key]})` : ''}.
                  </span>
                </label>
              </div>
              <p className="mt-2 text-[11px] text-gray-500">{m.hint}</p>
            </div>
          );
        })}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-5 px-6 py-3 rounded-xl neon-btn text-sm font-bold inline-flex items-center gap-2 disabled:opacity-40"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Kartalarni saqlash
      </button>

      {saving && (
        <p className="mt-3 flex items-center gap-2 text-xs text-amber-400">
          <AlertCircle size={13} /> Saqlanmoqda...
        </p>
      )}
    </div>
  );
}
