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
 * Ishonchli Google login tugmasi.
 * Google rasmiy GSI tugmasi (iframe) to'g'ridan-to'g'ri ko'rsatiladi — bu usul
 * har qanday brauzerda, cookie/himoya rejimida ham popup'ni ishonchli ochadi.
 * Oldingi "ko'rinmas overlay" yechimi bosilmay qolardi — endi rasmiy tugma ×yuqorida.
 */
export default function GoogleButton({ mode = 'signin', className = '' }: GoogleButtonProps) {
  const t = useTranslations('auth');
  const router = useRouter();
  const googleLogin = useAuthStore((s) => s.googleLogin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const buttonRef = useRef<HTMLDivElement>(null);
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (!CLIENT_ID || bootstrapped.current) return;
    bootstrapped.current = true;

    const callback = async (response: { credential?: string }) => {
      if (!response?.credential || busy) return;
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

    const start = () => {
      const el = buttonRef.current;
      if (!window.google?.accounts?.id || !el) {
        setLoadState('error');
        return;
      }

      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        ux_mode: 'popup',
        auto_select: false,
        callback,
      });

      const width = Math.max(300, Math.min(400, el.clientWidth || 340));
      window.google.accounts.id.renderButton(el, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        width,
        text: mode === 'signup' ? 'signup_with' : 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
      });
      window.google.accounts.id.disableAutoSelect();
      setLoadState('ready');
    };

    // GSI kutubxonasi layout'da yuklangan; bo'lmasa alohida yuklaymiz
    if (window.google?.accounts?.id) start();
    else {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = start;
      s.onerror = () => setLoadState('error');
      document.head.appendChild(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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
      <div className="relative w-full min-h-[44px]">
        {/* Rasmiy GSI tugmasi — to'liq kenglikda, ko'rinib turadi */}
        <div
          ref={buttonRef}
          className={
            loadState === 'ready'
              ? 'w-full flex justify-center [&>div]:!rounded-xl [&>div]:!w-full [&>div]:overflow-hidden [&>div]:shadow-[0_2px_8px_rgba(16,185,129,.12)] transition-shadow hover:[&>div]:shadow-[0_4px_16px_rgba(16,185,129,.28)]'
              : 'flex justify-center py-3'
          }
        />
        {loadState !== 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-gray-400 pointer-events-none">
            {loadState === 'error' ? (
              <span className="text-xs text-red-300 px-3 text-center">Google kutubxonasi yuklanmadi. Sahifani yangilang.</span>
            ) : (
              <>
                <Loader2 size={16} className="animate-spin text-neon-cyan" />
                Google tugmasi tayyorlanmoqda...
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2.5 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
        </p>
      )}
    </div>
  );
}