'use client';

/**
 * To'lov provayderlari brend logotiplari (inline SVG, tashqi yuklanma yo'q).
 * Har bir belgi rasmiy brend ranglari asosida chizilgan (Click, Payme, Uzum, Paynet).
 * Spec §5.14 — checkout kartalarida haqiqiy brend logotiplari ko'rsatiladi.
 */

const BRAND_TEXT = {
  CLICK: { text: 'click', color: '#0A66C2', font: 16, lightBg: false },
  PAYME: { text: 'Payme', color: '#F49A00', font: 14.5, lightBg: false },
  UZUM: { text: 'UZUM', color: '#3C0DFF', font: 11.5, lightBg: true },
  PAYNET: { text: 'Paynet', color: '#0B76F5', font: 13, lightBg: false },
} as const;

function BrandRect({ color, lightBg }: { color: string; lightBg?: boolean }) {
  const stroke = lightBg ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.0)';
  return (
    <rect
      x="1"
      y="1"
      width="30"
      height="30"
      rx="7"
      fill={color}
      stroke={stroke}
      strokeWidth="1"
    />
  );
}

function Wordmark({ text, font, color }: { text: string; font: number; color: string }) {
  const letterSpacing = text === 'UZUM' ? 0.5 : -0.4;
  return (
    <text
      x="16"
      y={text === 'UZUM' ? 16.8 : 16.1}
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily="Inter, Arial, Helvetica, sans-serif"
      fontWeight="800"
      fontSize={font}
      letterSpacing={letterSpacing}
      fill={color}
    >
      {text}
    </text>
  );
}

export default function ProviderLogo({
  method,
  size = 22,
}: {
  method: string;
  size?: number;
}) {
  const m = String(method).toUpperCase();
  if (m === 'CASH') {
    // Kassada — neytral naqd pul belgisi
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Kassada">
        <rect x="1" y="1" width="30" height="30" rx="7" fill="#f59e0b" />
        <rect x="8" y="11" width="16" height="11" rx="1.5" fill="white" />
        <circle cx="16" cy="16.5" r="3" fill="#f59e0b" />
      </svg>
    );
  }
  const brand = BRAND_TEXT[m as keyof typeof BRAND_TEXT];
  if (!brand) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={brand.text}>
      <BrandRect color={brand.color} lightBg={brand.lightBg} />
      <Wordmark text={brand.text} font={brand.font} color="white" />
    </svg>
  );
}