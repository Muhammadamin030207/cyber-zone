'use client';

import { useId } from 'react';

/**
 * Cyber-ZONE logotipi — HTML5 gaming klublar platformasi uchun
 * Neon gradient "CZ" olmosh-ishorasi (hexagon + zik-zak bolt)
 */
export default function Logo({
  size = 36,
  className,
  showText = false,
  text = 'CYBER',
}: {
  size?: number;
  className?: string;
  showText?: boolean;
  text?: string;
}) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const grad = `cz-grad-${gid}`;

  return (
    <span className={`inline-flex items-center gap-2 ${className || ''}`}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-label="Cyber-ZONE" role="img" className="shrink-0 drop-shadow-[0_2px_10px_color-mix(in_srgb,var(--acc-a)_45%,transparent)]">
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--acc-a)" />
            <stop offset="1" stopColor="var(--acc-b)" />
          </linearGradient>
        </defs>

        {/* Tile */}
        <rect x="2.5" y="2.5" width="43" height="43" rx="12.5" fill="var(--bg-2)" stroke={`url(#${grad})`} strokeWidth="2" />

        {/* Hexagon */}
        <path
          d="M24 9.5 36 16.2 v15.6 L24 38.5 12 31.8 V16.2 Z"
          fill="color-mix(in srgb, var(--acc-a) 10%, transparent)"
          stroke={`url(#${grad})`}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />

        {/* C·Z bolt */}
        <path
          d="M16.5 21.5 h6.4 l-3.2 5 h6.8"
          stroke={`url(#${grad})`}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Signal nuqta */}
        <circle cx="24" cy="14.5" r="2.1" fill="var(--acc-b)" />
        <path d="M17 29.5 h14" stroke="var(--fg-dim)" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
      </svg>
      {showText && (
        <span className="font-[--font-orbitron] font-bold tracking-widest text-lg leading-none">
          {text}
          <span className="text-neon-cyan">-ZONE</span>
        </span>
      )}
    </span>
  );
}