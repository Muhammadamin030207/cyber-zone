'use client';

import { useRef } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const PREFIX = '+998 ';

function formatPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('998')) digits = digits.slice(3);
  if (digits.startsWith('9')) digits = digits.slice(1);
  digits = digits.slice(0, 9);

  const p: string[] = [];
  if (digits.length > 0) p.push(digits.slice(0, 2));
  if (digits.length > 2) p.push(digits.slice(2, 5));
  if (digits.length > 5) p.push(digits.slice(5, 7));
  if (digits.length > 7) p.push(digits.slice(7, 9));

  return p.length ? `${PREFIX}${p.join(' ')}` : PREFIX;
}

export default function PhoneInput({ value, onChange, placeholder, className, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        pattern="\+998 [0-9]{2} [0-9]{3} [0-9]{2} [0-9]{2}"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = formatPhone(e.target.value);
          onChange(next);
        }}
        onKeyDown={(e) => {
          if (e.key.length === 1 && /\D/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
            e.preventDefault();
          }
        }}
        placeholder={placeholder || '+998 90 123 45 67'}
        className={`glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none tabular-nums ${className || ''}`}
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
    return formatPhone(v);
  }
  return v;
}