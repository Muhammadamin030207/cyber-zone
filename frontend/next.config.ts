import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Backend (Render) origin. Room/avatar rasmlari backend'da `/uploads/...`
 * ko'rinishida saqlanadi, lekin frontend ularni o'z origin'i (Vercel)
 * bo'yicha resolve qiladi -> 404. Shu sabab `/uploads/*` so'rovlari
 * backendga proksi qilinadi (pastdagi `rewrites`).
 *
 * MUHIM: bu URL — maxfiy emas (host), shuning uchun env'dan olinadi.
 * Build paytida `BACKEND_URL` yoki `NEXT_PUBLIC_API_URL` dan olinadi
 * (build'da `process.env` orqali; `NEXT_PUBLIC_*` Vercel'da build env'da
 * bo'lishi shart). Topilmasa — lokal ishlash uchun localhost.
 */
const BACKEND_ORIGIN = (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:5000'
).replace(/\/+$/, '');

function remotePattern(origin: string) {
  try {
    const url = new URL(origin);
    return {
      protocol: url.protocol.replace(':', '') as 'http' | 'https',
      hostname: url.hostname,
      port: url.port,
      pathname: '/uploads/**',
    };
  } catch {
    return { protocol: 'https' as const, hostname: 'localhost', port: '5000', pathname: '/uploads/**' };
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Backend (Render) — absolute URL'dagi rasmlar uchun
      remotePattern(BACKEND_ORIGIN),
    ],
  },

  /**
   * Xavfsizlik header'lari.
   *
   * AVVAL umuman yo'q edi — Vercel faqat platforma defaultlarini (HTTPS)
   * qo'yadi, ilova darajasida hech narsa yo'q edi: clickjacking (X-Frame-Options
   * yo'q), MIME-sniffing, referrer leak va kamera/mikrofon ommaviy ravishda
   * ruxsat etilgan holda qolgan edi.
   *
   * CSP ni qo'yishda uchta joyga e'tibor berildi:
   *   1) `layout.tsx` dagi tema bootstrap script'i `dangerouslySetInnerHTML`
   *      bilan inline ishlaydi -> `script-src` ga `'unsafe-inline'` kerak
   *      (nonce Next.js 16 proxy bilan ishlashini talab qiladi, bu ilovada
   *      `src/proxy.ts` next-intl middleware'i bilan band).
   *   2) Google Identity (One Tap/GSI) `accounts.google.com` dan yuklanadi,
   *      `connect-src` ga `https://accounts.google.com/gsi/` kerak.
   *   3) Yuz tekshiruvi (MediaPipe/WASM) `wasm-unsafe-eval` va
   *      `blob:`/`mediastream` dan foydalanadi — `face-verified` ishlashi
   *      uchun zaruriy. Kameraesa `Permissions-Policy` orqali FAQAT
   *      o'z origin'imizga beriladi.
   */
  async headers() {
    const csp = [
      "default-src 'self'",
      // `unsafe-inline` — tema bootstrap script'i (layout.tsx) va JSON-LD uchun.
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://accounts.google.com https://cdn.jsdelivr.net",
      // Tailwind/next-intl inline style'lar + MediaPipe/WASM worker.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com https://accounts.google.com",
      // API (Render), Vercel preview, Google GSI, WebSocket (socket.io).
      "connect-src 'self' https: wss: blob:",
      "media-src 'self' blob: mediastream:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "frame-src 'self' https://accounts.google.com",
      "upgrade-insecure-requests",
    ].join('; ');

    // `frame-ancestors 'none'` allaqachon X-Frame-Options'ni kuchaytiradi, lekin
    // eski brauzerlar uchun XFO ham qo'yiladi.
    const securityHeaders = [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      {
        key: 'Permissions-Policy',
        // Kamera faqat yuz tekshiruvi uchun o'z origin'imizda. Mikrofon umuman
        // kerak emas. Geolocation `/location` sahifasida ishlatiladi, shuning
        // uchun o'z origin'iga ruxsat beriladi.
        value: 'camera=(self), microphone=(), geolocation=(self), payment=(self), usb=()',
      },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    ];

    return [
      // Barcha marshrutlar (sahifalar ham, API proksi ham).
      { source: '/:path*', headers: securityHeaders },
      // Next.js statik aktivlar uchun keshlashni buzmaslik uchun CSP'ni
      // alohida qisqartirilgan variantda ham qo'yamiz (oddiy `script-src` yetarli).
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
      },
    ];
  },

  async rewrites() {
    return {
      // `/uploads/rooms/x.jpg` -> `${BACKEND_ORIGIN}/uploads/rooms/x.jpg`
      // (next/image optimizer ham o'z origin'i orqali so'raydi — shu
      // rewrite optimizer'ga ham kerak, aks holda 400/404).
      afterFiles: [
        {
          source: '/uploads/:path*',
          destination: `${BACKEND_ORIGIN}/uploads/:path*`,
        },
      ],
      // Boshqa narsani backendga proksi qilmaymiz (API frontend orqali
      // axios bilan boradi) — faqat statik fayllar.
      beforeFiles: [],
      fallback: [],
    };
  },
};

export default withNextIntl(nextConfig);
