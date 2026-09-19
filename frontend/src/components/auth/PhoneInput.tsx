'use client';

import { useRef } from 'react';
import { Phone } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Teleg fon raqam kiritish maydoni:
 * - "+998" prefiksi doim ochiq TURMAYDI — bo'sh holatda faqat ikonka (+ flag) ko'rinadi
 * - Foydalanuvchi raqam yozishni boshlagani zahoti "+998" avtomatik qo'shiladi
 * - Yonida mos ikonka (telefon + O'zbekiston bayrog'i)
 */
function toParts(digits: string): string {
  const p: string[] = [];
  if (digits.length > 0) p.push(digits.slice(0, 2));
  if (digits.length > 2) p.push(digits.slice(2, 5));
  if (digits.length > 5) p.push(digits.slice(5, 7));
  if (digits.length > 7) p.push(digits.slice(7, 9));
  return p.join(' ');
}

function normalize(raw: string, focused: boolean): string {
  let d = raw.replace(/\D/g, '');
  if (!d) return focused ? '+998 ' : '';

  // "998...", "8...", "0..." prefikslaridan tozalash
  if (d.startsWith('998')) d = d.slice(3);
  else if (d.startsWith('8') || d.startsWith('0')) d = d.slice(1);

  d = d.slice(0, 9);
  return `+998 ${toParts(d)}`;
}

export default function PhoneInput({ value, onChange, placeholder, className, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      {/* Yonidagi ikonka — +998 prefiks o'rniga */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-md bg-white/5 border border-white/10 pointer-events-none">
        <Phone size={13} className="text-gray-400" />
      </div>

      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        pattern="\+998 [0-9]{2} [0-9]{3} [0-9]{2} [0-9]{2}"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = normalize(e.target.value, true);
          onChange(next);
        }}
        onFocus={() => {
          // Fokusda bo'sh bo'lsa, kursor o'ynashini ko'rsatamiz (prefiks yozilmaydi)
          if (!value && !disabled) {
            // hech narsa qo'shmaymiz — "ochiq turishi" shart emas
          }
        }}
        onKeyDown={(e) => {
          if (e.key.length === 1 && /\D/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
            e.preventDefault();
          }
        }}
        placeholder={placeholder || '+998 90 123 45 67'}
        className={`glass-input w-full rounded-xl pl-12 pr-3 py-2.5 text-sm outline-none tabular-nums peer ${className || ''}`}
      />
    </div>
  );
}

/** Toza raqam: "+998 90 123 45 67" -> "998901234567" */
export function phoneToDigits(v: string): string {
  return v.replace(/[^\d]/g, '');
}

/** To'liq validatsiya: +998 XX XXX XX XX */
export function isValidUzbekPhone(v: string): boolean {
  return /^\+998 [0-9]{2} [0-9]{3} [0-9]{2} [0-9]{2}$/.test(v);
}

/** +/- telefon maskasi (tahrirlash rejimida) */
export function normalizePhone(v: string): string {
  if (!v) return '';
  if (/^\+\d+$/.test(v) || /^998\d+$/.test(v)) {
    return normalize(v, true);
  }
  return v;
}