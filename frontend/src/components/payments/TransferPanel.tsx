'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, CreditCard, ExternalLink, ImagePlus, Loader2, ShieldCheck, Smartphone, Trash2, Upload } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { toastError, toastInfo, toastSuccess } from '@/lib/toast';
import { cn, formatPrice } from '@/lib/utils';

export interface MerchantCard {
  number: string;
  numberFormatted: string;
  holder: string;
  bank: string;
  note: string;
  /** Bank/to'lov ilovasining URL'i — «Ilovaga o'tib to'lash» tugmasi shuni ochadi. */
  appUrl?: string;
}

const MAX_RECEIPTS = 3;
const MAX_MB = 8;

type Phase = 'idle' | 'submitting' | 'submitted';

/** Tanlangan chek + uning ko'rish uchun yaratilgan object URL. */
type Picked = { file: File; url: string };

/**
 * Qo'lda o'tkazma (karta -> bank) oqimi.
 *
 * XAVFSIZLIK: to'liq karta raqami hech qachon yuborilmaydi va saqlanmaydi.
 * Faqat OXIRGI 4 raqam + karta egasi ismi + chek screenshotlari yuboriladi.
 * To'lovni tasdiqlash — faqat admin (bank hisobida tekshirgandan keyin).
 */
export default function TransferPanel({
  paymentId,
  amount,
  merchantCard,
  alreadySubmitted,
  appName,
  receiptNumber,
  onDone,
}: {
  paymentId: string;
  amount: number;
  merchantCard: MerchantCard | null;
  alreadySubmitted?: boolean;
  /** «Ilovaga o'tib to'lash» tugmasi matni uchun — masalan "Payme". */
  appName?: string;
  /** Chek (kutilmoqda) raqami — admin bankda shu raqam bo'yicha qidiradi. */
  receiptNumber?: string | null;
  onDone?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(alreadySubmitted ? 'submitted' : 'idle');
  const [last4, setLast4] = useState('');
  const [holder, setHolder] = useState('');
  const [picked, setPicked] = useState<Picked[]>([]);
  const [copied, setCopied] = useState(false);
  const [copiedReceipt, setCopiedReceipt] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const pickedRef = useRef<Picked[]>([]);
  const files = picked.map((p) => p.file);

  // object URL'lar fayl tanlanganda YARATILADI (render'da emas — render toza
  // bo'lishi shart) va o'chirilganda darhol bekor qilinadi. Sahifa yopilganda
  // qolganlari tozalanadi (memory leak bo'lmasin).
  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);

  useEffect(
    () => () => {
      pickedRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    },
    []
  );

  async function copyNumber() {
    if (!merchantCard?.number) return;
    try {
      await navigator.clipboard.writeText(merchantCard.number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toastError("Karta raqamini nusxalab bo'lmadi — qo'lda yozib oling");
    }
  }

  async function copyReceipt() {
    if (!receiptNumber) return;
    try {
      await navigator.clipboard.writeText(receiptNumber);
      setCopiedReceipt(true);
      setTimeout(() => setCopiedReceipt(false), 2000);
    } catch {
      toastError("Chek raqamini nusxalab bo'lmadi");
    }
  }

  function removeFile(index: number) {
    const target = picked[index];
    if (target) URL.revokeObjectURL(target.url);
    setPicked((prev) => prev.filter((_, idx) => idx !== index));
  }

  function pickFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf');
    if (incoming.length === 0) {
      toastError("Faqat rasm yoki PDF fayl tanlang");
      return;
    }
    setError('');
    const room = MAX_RECEIPTS - picked.length;
    if (room <= 0) {
      toastInfo(`Ko'pi bilan ${MAX_RECEIPTS} ta chek yuklanadi`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    const accepted = incoming.slice(0, room);
    if (incoming.length > accepted.length) {
      toastInfo(`Ko'pi bilan ${MAX_RECEIPTS} ta chek yuklanadi`);
    }
    const added: Picked[] = accepted.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPicked((prev) => [...prev, ...added]);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function submit() {
    setError('');

    if (!/^\d{4}$/.test(last4.trim())) {
      setError("Karta raqamining oxirgi 4 ta raqamini kiriting");
      return;
    }
    if (holder.trim().length < 3) {
      setError('Karta egasi ism-familiyasini to\'liq kiriting');
      return;
    }
    if (files.length === 0) {
      setError('Kamida bitta chek (screenshot) yuklang');
      return;
    }
    const tooBig = files.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) {
      setError(`"${tooBig.name}" ${MAX_MB} MB dan katta`);
      return;
    }

    setPhase('submitting');
    try {
      const fd = new FormData();
      fd.append('proofCardLast4', last4.trim());
      fd.append('proofCardholderName', holder.trim());
      files.forEach((f) => fd.append('receipts', f));

      await api.post(`/api/payments/${paymentId}/proof`, fd);
      setPhase('submitted');
      toastSuccess("Chek yuborildi — admin bank hisobida tekshiradi");
      onDone?.();
    } catch (e) {
      setPhase('idle');
      setError(getApiErrorMessage(e, 'Chekni yuborishda xatolik'));
    }
  }

  // ---------------- Yuborilgach: kutish holati ----------------
  if (phase === 'submitted') {
    return (
      <div className="rounded-2xl border border-neon-cyan/30 bg-neon-cyan/[0.07] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-neon-cyan/15 border border-neon-cyan/30 shrink-0">
            <ShieldCheck size={20} className="text-neon-cyan" />
          </span>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-white">Chekingiz qabul qilindi</h3>
            <p className="text-xs text-gray-300 mt-1 leading-relaxed">
              Admin bank hisobida pulni tekshiradi va tasdiqlaydi. Bu odatda bir necha daqiqa
              oladi. Tasdiqlashdan keyin bu sahifa avtomatik yangilanadi.
            </p>
            {last4 && (
              <p className="text-[11px] text-gray-500 mt-2">
                Yuborilgan chek: karta <b className="text-gray-300">•••• {last4}</b> ·{' '}
                {holder.trim()}
              </p>
            )}
            {receiptNumber && (
              <p className="text-[11px] text-gray-500 mt-2.5">
                Chek raqami:{' '}
                <button
                  type="button"
                  onClick={copyReceipt}
                  className="inline-flex items-center gap-1 font-mono font-bold tracking-widest text-neon-cyan"
                >
                  {receiptNumber}
                  {copiedReceipt ? <Check size={12} className="text-neon-green" /> : <Copy size={12} />}
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------- Karta + forma ----------------
  return (
    <div className="space-y-4">
      {/* 1. Xaqiqiy bank kartasi (bank nomi API'dan keladi) */}
      {merchantCard ? (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
              Pul o'tkazing
              <span className="ml-2 text-sm font-bold text-neon-cyan normal-case tracking-normal">
                {formatPrice(amount)}
              </span>
            </p>
            {merchantCard.bank && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/15 text-gray-400">
                {merchantCard.bank}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={copyNumber}
            className="w-full group flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl bg-black/35 border border-white/10 hover:border-neon-cyan/40 transition-colors text-left"
          >
            <span className="font-mono text-base sm:text-lg font-bold tracking-[0.12em] text-white truncate">
              {merchantCard.numberFormatted}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-neon-cyan shrink-0">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Nusxalandi' : 'Nusxa'}
            </span>
          </button>

          {merchantCard.holder && (
            <p className="text-[11px] text-gray-500 mt-2.5">
              Egasi: <span className="text-gray-300">{merchantCard.holder}</span>
            </p>
          )}
          {merchantCard.note && (
            <p className="text-[11px] text-amber-300/90 mt-1.5">{merchantCard.note}</p>
          )}

          {merchantCard.appUrl && (
            <a
              href={merchantCard.appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-neon-cyan/35 bg-neon-cyan/10 text-sm font-bold text-neon-cyan hover:bg-neon-cyan/20 transition-colors"
            >
              <Smartphone size={15} aria-hidden="true" />
              Ilovaga o&apos;tib to&apos;lash{appName ? ` — ${appName}` : ''}
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          )}

          {receiptNumber && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
              <span className="text-[11px] text-gray-400">
                Chek raqami <span className="text-gray-600">— adminga ayting</span>
              </span>
              <button
                type="button"
                onClick={copyReceipt}
                className="inline-flex items-center gap-1.5 font-mono text-sm font-bold tracking-widest text-white"
              >
                {receiptNumber}
                {copiedReceipt ? <Check size={13} className="text-neon-green" /> : <Copy size={13} className="text-gray-500" />}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div role="status" className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-sm text-amber-200">
          Hali bank karta raqami kiritilmagan. Iltimos, administratorga murojaat qiling.
        </div>
      )}

      {/* 2. To'lov ma'lumotlari + chek */}
      <div className="rounded-2xl border border-white/10 surface p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center gap-2">
          <CreditCard size={15} className="text-neon-cyan shrink-0" />
          <h3 className="text-sm font-semibold">O'tkazma ma'lumotlari</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] text-gray-400 mb-1.5">
              Karta oxirgi 4 raqam <span className="text-neon-cyan">*</span>
            </span>
            <input
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="1234"
              className="w-full px-3.5 py-3 rounded-xl bg-black/30 border border-white/10 focus:border-neon-cyan/50 outline-none text-white font-mono tracking-widest text-sm"
            />
          </label>

          <label className="block">
            <span className="block text-[11px] text-gray-400 mb-1.5">
              Karta egasi (ism-familiya) <span className="text-neon-cyan">*</span>
            </span>
            <input
              value={holder}
              onChange={(e) => setHolder(e.target.value.slice(0, 120))}
              autoComplete="name"
              placeholder="Sardor Alimov"
              className="w-full px-3.5 py-3 rounded-xl bg-black/30 border border-white/10 focus:border-neon-cyan/50 outline-none text-white text-sm"
            />
          </label>
        </div>

        {/* Cheklar */}
        <div>
          <span className="block text-[11px] text-gray-400 mb-1.5">
            Chek (screenshot) <span className="text-neon-cyan">*</span>{' '}
            <span className="text-gray-600">— {files.length}/{MAX_RECEIPTS}, har biri {MAX_MB} MB gacha</span>
          </span>

          <div className="grid grid-cols-3 gap-2">
            {picked.map((p, i) => (
              <div
                key={`${p.file.name}-${i}`}
                className="relative aspect-[3/4] rounded-xl overflow-hidden border border-white/10 bg-black/30"
              >
                {p.url && p.file.type.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={`Chek ${i + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-[10px] text-gray-400 px-1 text-center">
                    {p.file.name.slice(-12)}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute top-1 right-1 w-6 h-6 grid place-items-center rounded-lg bg-black/75 text-red-400 hover:bg-black"
                  aria-label="O'chirish"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}

            {picked.length < MAX_RECEIPTS && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={cn(
                  'aspect-[3/4] rounded-xl border-2 border-dashed border-white/15 text-gray-500',
                  'hover:border-neon-cyan/50 hover:text-neon-cyan transition-colors',
                  'grid place-items-center gap-1 p-1'
                )}
              >
                <ImagePlus size={18} className="mx-auto" />
                <span className="text-[10px] leading-tight text-center">Chek qo'shish</span>
              </button>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            onChange={(e) => pickFiles(e.target.files)}
            className="hidden"
          />
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={phase === 'submitting' || !merchantCard}
          className="w-full py-3.5 rounded-xl neon-btn flex items-center justify-center gap-2 font-bold disabled:opacity-40"
        >
          {phase === 'submitting' ? (
            <><Loader2 size={17} className="animate-spin" /> Yuborilmoqda...</>
          ) : (
            <><Upload size={17} /> Chekni yuborish</>
          )}
        </button>

        <p className="text-[10.5px] text-gray-500 leading-relaxed text-center">
          Xavfsizlik uchun to'liq karta raqamini yubormaymiz — faqat oxirgi 4 raqam saqlanadi.
        </p>
      </div>
    </div>
  );
}
