'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, CreditCard, ImagePlus, Loader2, ShieldCheck, Trash2, Upload } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { toastError, toastInfo, toastSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';

export interface MerchantCard {
  number: string;
  numberFormatted: string;
  holder: string;
  bank: string;
  note: string;
}

const MAX_RECEIPTS = 3;
const MAX_MB = 8;

type Phase = 'idle' | 'submitting' | 'submitted';

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
  onDone,
}: {
  paymentId: string;
  amount: number;
  merchantCard: MerchantCard | null;
  alreadySubmitted?: boolean;
  onDone?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(alreadySubmitted ? 'submitted' : 'idle');
  const [last4, setLast4] = useState('');
  const [holder, setHolder] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // object URL'arni tozalash (memory leak bo'lmasin)
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

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

  function pickFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf');
    if (incoming.length === 0) {
      toastError("Faqat rasm yoki PDF fayl tanlang");
      return;
    }
    setError('');
    setFiles((prev) => {
      const next = [...prev, ...incoming].slice(0, MAX_RECEIPTS);
      if (prev.length + incoming.length > MAX_RECEIPTS) {
        toastInfo(`Ko'pi bilan ${MAX_RECEIPTS} ta chek yuklanadi`);
      }
      return next;
    });
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
            {files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="relative aspect-[3/4] rounded-xl overflow-hidden border border-white/10 bg-black/30"
              >
                {previews[i] && f.type.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews[i]} alt={`Chek ${i + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-[10px] text-gray-400 px-1 text-center">
                    {f.name.slice(-12)}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute top-1 right-1 w-6 h-6 grid place-items-center rounded-lg bg-black/75 text-red-400 hover:bg-black"
                  aria-label="O'chirish"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}

            {files.length < MAX_RECEIPTS && (
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
