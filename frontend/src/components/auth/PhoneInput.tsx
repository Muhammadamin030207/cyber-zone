'use client';

import React, { forwardRef } from 'react';

/** +998 XX XXX XX XX formatida chiqadi. Prefix "+998" o'chmaydi. */
export function formatUzPhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('998')) digits = digits.slice(3);
  else if (digits.startsWith('8')) digits = digits.slice(1);
  digits = digits.slice(0, 9);

  let out = '+998';
  if (digits.length > 0) out += ' ' + digits.slice(0, 2);
  if (digits.length > 2) out += ' ' + digits.slice(2, 5);
  if (digits.length > 5) out += ' ' + digits.slice(5, 7);
  if (digits.length > 7) out += ' ' + digits.slice(7, 9);
  return out;
}

/** Backendga yuborish uchun ixcham: +998901234567 */
export function normalizeUzPhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('998')) digits = digits.slice(3);
  else if (digits.startsWith('8')) digits = digits.slice(1);
  return '+998' + digits.slice(0, 9);
}

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onValueChange: (formatted: string) => void;
}

const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { value, onValueChange, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      inputMode="numeric"
      autoComplete="tel-national"
      value={value}
      onChange={(e) => {
        const clean = e.target.value.replace(/[^\d+]/g, '');
        onValueChange(formatUzPhone(clean));
      }}
      {...props}
    />
  );
});

export default PhoneInput;