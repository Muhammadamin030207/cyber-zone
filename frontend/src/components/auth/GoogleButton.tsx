'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';
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
          prompt: (listener?: () => void) => void;
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
 * Google rasmiy GSI tugmasi.
 * - O'lcham forma kengligiga moslashadi (ResizeObserver bilan kuzatiladi)
 * - Yuklanish holati toza ko'rsatiladi, script xatosida "qayta urinish" beriladi
 * - Tugma ustiga bosilganda prompt() bilan ishonchli ochiladi
 */
export default function GoogleButton({ mode = 'signin', className = '' }: GoogleButtonProps) {
  const t = useTranslations('auth');
  const router = useRouter();
  const googleLogin = useAuthStore((s) => s.googleLogin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [width, setWidth] = useState(300);
  const buttonRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bootstrapped = useRef(false);

  const handleCredential = useCallback(
    async (response: { credential?: string }) => {
      if (!response?.credential || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await googleLogin(response.credential);
        const user = useAuthStore.getState().user;

        if ((res as any)?.data?.data?.pendingRegister) {
          const profile = (res as any).data.data.profile;
          try {
            sessionStorage.setItem(
              'google_prefill',
              JSON.stringify({ fullName: profile?.fullName || '', email: profile?.email || '', avatarUrl: profile?.avatarUrl || '' })
            );
            sessionStorage.setItem('google_token', response.credential);
          } catch {
            /* ignore */
          }
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
    },
    [busy, googleLogin, router, t]
  );

  const handleref = useRef(handleCredential);
  handleref.current = handleCredential;

  useEffect(() => {
    if (!CLIENT_ID || bootstrapped.current) return;
    bootstrapped.current = true;

    // GSI kutubxonasi layout'da yuklangan; bo'lmasa alohida yuklaymiz
    if (window.google?.accounts?.id) {
      setLoadState('loading');
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        ux_mode: 'popup',
        auto_select: false,
        login_uri: window.location.origin,
        callback: (r: unknown) => handleref.current(r as { credential?: string }),
      });
      setLoadState('ready');
      return;
    }
    setLoadState('loading');
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => {
      window.google?.accounts?.id.initialize({
        client_id: CLIENT_ID,
        ux_mode: 'popup',
        auto_select: false,
        login_uri: window.location.origin,
        callback: (r: unknown) => handleref.current(r as { credential?: string }),
      });
      setLoadState('ready');
    };
    s.onerror = () => setLoadState('error');
    document.head.appendChild(s);
  }, []);

  // Forma kengligini kuzatib, GSI tugmasini aniq kenglikda render qilamiz
  useEffect(() => {
    if (loadState !== 'ready' || !wrapRef.current) return;
    const measure = () => {
      const w = Math.floor(wrapRef.current?.getBoundingClientRect().width || 300);
      setWidth(Math.max(260, Math.min(400, w)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [loadState]);

  useEffect(() => {
    if (loadState !== 'ready' || !buttonRef.current) return;
    const el = buttonRef.current;
    window.google?.accounts?.id.renderButton(el, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      width,
      text: mode === 'signup' ? 'signup_with' : 'signin_with',
      shape: 'pill',
      logo_alignment: 'left',
    });
    window.google?.accounts?.id.disableAutoSelect();
  }, [loadState, width, mode]);

  const retry = () => {
    setLoadState('loading');
    setError(null);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => {
      window.google?.accounts?.id.initialize({
        client_id: CLIENT_ID,
        ux_mode: 'popup',
        auto_select: false,
        login_uri: window.location.origin,
        callback: (r: unknown) => handleref.current(r as { credential?: string }),
      });
      setLoadState('ready');
    };
    s.onerror = () => setLoadState('error');
    document.head.appendChild(s);
  };

  if (!CLIENT_ID) {
    return (
      <div className={className}>
        <p className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {t('googleSetup') || 'Google OAuth Client ID o‘rnatilmagan.'}
        </p>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <div ref={wrapRef} className="relative w-full" style={{ minHeight: 44 }}>
        {loadState === 'ready' ? (
          <div
            ref={buttonRef}
            className="w-full flex justify-center hover:scale-[1.02] hover:brightness-110 active:scale-[0.97] transition-all duration-200 will-change-transform [&>div]:!overflow-hidden"
          />
        ) : (
          <div
            className={`absolute inset-0 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-cyber-900/40 text-sm text-gray-400 ${
              loadState === 'error' ? '' : 'pointer-events-none'
            }`}
          >
            {loadState === 'error' ? (
              <button
                onClick={retry}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-300 hover:text-red-200 transition-colors"
              >
                <RotateCcw size={13} /> Google kutubxonasi yuklanmadi — qayta urinish
              </button>
            ) : (
              <>
                <Loader2 size={15} className="animate-spin text-neon-cyan" />
                Yuklanmoqda...
              </>
            )}
          </div>
        )}
      </div>

      {busy && (
        <p className="mt-2 flex items-center justify-center gap-2 text-xs text-gray-400">
          <Loader2 size={13} className="animate-spin text-neon-cyan" /> Google bilan tekshirilmoqda...
        </p>
      )}

      {error && (
        <p className="mt-2.5 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
        </p>
      )}
    </div>
  );
}