'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useAuthStore } from '@/store/auth';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: unknown) => void;
          renderButton: (el: HTMLElement, options: unknown) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

interface GoogleButtonProps {
  mode?: 'signin' | 'signup';
  className?: string;
}

/**
 * Tez (fast) Google login tugmasi:
 * - Maxsus zamonaviy tugma (brend 🙂)
 * - Yuqorida ko'rinmas (opacity-0) rasmiy GSI tugmasi klikni tutadi — popup darhol ochiladi
 * - GSI kutubxonasi layout'da oldindan (defer) yuklanadi — sekinlashish yo'q
 */
export default function GoogleButton({ mode = 'signin', className = '' }: GoogleButtonProps) {
  const t = useTranslations('auth');
  const router = useRouter();
  const googleLogin = useAuthStore((s) => s.googleLogin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!CLIENT_ID || !overlayRef.current || initialized.current) return;
    initialized.current = true;

    const start = () => {
      if (!window.google?.accounts?.id || !overlayRef.current) return;

      const callback = async (response: { credential?: string }) => {
        if (!response?.credential) return;
        setBusy(true);
        setError(null);
        try {
          const res = await googleLogin(response.credential);
          const user = useAuthStore.getState().user;

          // Yangi foydalanuvchi — register sahifasiga profil oldindan to'ldirilgan holda o'tamiz
          if ((res as any)?.data?.data?.pendingRegister) {
            const profile = (res as any).data.data.profile;
            try {
              sessionStorage.setItem(
                'google_prefill',
                JSON.stringify({ fullName: profile?.fullName || '', email: profile?.email || '', avatarUrl: profile?.avatarUrl || '' })
              );
              sessionStorage.setItem('google_token', response.credential);
            } catch { /* ignore */ }
            router.push('/register?google=1');
            router.refresh();
            return;
          }

          if (!user) {
            router.push('/login');
          } else if (user.role === 'SUPER_ADMIN') {
            router.push('/super-admin');
          } else if (user.role === 'ADMIN') {
            router.push('/admin');
          } else {
            router.push('/dashboard');
          }
          router.refresh();
        } catch (err: any) {
          setError(err?.response?.data?.message || t('googleError') || 'Google bilan kirishda xatolik');
        } finally {
          setBusy(false);
        }
      };

      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        ux_mode: 'popup',
        callback,
      });

      const w = Math.max(280, Math.min(400, overlayRef.current.clientWidth || 360));
      window.google.accounts.id.renderButton(overlayRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        width: w,
        text: mode === 'signup' ? 'signup_with' : 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
      });
      window.google.accounts.id.disableAutoSelect();
    };

    if (window.google?.accounts?.id) start();
    else {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = start;
      document.head.appendChild(s);
    }
  }, [googleLogin, mode, router, t]);

  if (!CLIENT_ID) {
    return (
      <div className={className}>
        <p className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {t('googleSetup') || 'Google OAuth Client ID o‘rnatilmagan.'}
        </p>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <div className="relative">
        {/* Ko'rinmas rasmiy GSI orqali popup — klik shu elementga boradi */}
        <div
          ref={overlayRef}
          className="absolute inset-0 z-20 opacity-0 overflow-hidden pointer-events-auto"
          aria-hidden
        />

        {/* Maxsus ko'rinadigan tugma */}
        <button
          type="button"
          onClick={() => overlayRef.current?.querySelector('iframe')?.click()}
          disabled={busy}
          className="relative z-10 w-full py-3 rounded-xl glass border border-white/15 flex items-center justify-center gap-3 text-sm font-semibold text-gray-200 hover:border-white/30 hover:bg-white/5 transition-colors disabled:opacity-60"
        >
          {busy ? (
            <Loader2 size={18} className="animate-spin text-gray-400" />
          ) : (
            <span className="w-[18px] h-[18px] rounded-full bg-white flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
                />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.93 10.93 0 0 0 12 1a11 11 0 0 0-9.82 6.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
              </svg>
            </span>
          )}
          {mode === 'signup' ? t('googleSignup') || 'Google orqali ro\'yxatdan o\'tish' : t('googleLogin') || 'Google orqali kirish'}
        </button>
      </div>

      {error && (
        <p className="mt-2.5 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
        </p>
      )}
    </div>
  );
}