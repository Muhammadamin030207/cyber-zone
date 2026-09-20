'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useAuthStore } from '@/store/auth';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

type MomentNotification = {
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
  getNotDisplayedReason?: () => string;
  getDismissedReason?: () => string;
};

type GsiResponse = { credential?: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: Record<string, unknown>) => void;
          prompt: (listener?: (notification: MomentNotification) => void) => void;
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
 * Google orqali kirish — Cyber-ZONE uslubiga mos custom premium tugma.
 * - Google Identity Services (GIS) popup flow saqlanadi
 * - Tugma bosilganda google.accounts.id.prompt() orqali Google
 *   account chooser (Google tomonidan boshqariladigan UI) ochiladi
 * - Google'ning iframe ichidagi UI'iga CSS bilan tegilmaydi
 */
export default function GoogleButton({ mode = 'signin', className = '' }: GoogleButtonProps) {
  const t = useTranslations('auth');
  const router = useRouter();
  const googleLogin = useAuthStore((s) => s.googleLogin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const bootstrapped = useRef(false);
  const credentialRef = useRef<(r: GsiResponse) => void>(() => {});

  const handleCredential = useCallback(
    async (response: GsiResponse) => {
      if (!response?.credential || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = (await googleLogin(response.credential)) as {
          data?: { data?: { pendingRegister?: boolean; profile?: { fullName?: string; email?: string; avatarUrl?: string } } };
        };
        const user = useAuthStore.getState().user;

        if (res?.data?.data?.pendingRegister) {
          const profile = res.data.data.profile;
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
      } catch (err: unknown) {
        const apiError = err as { response?: { data?: { message?: string } } };
        setError(apiError?.response?.data?.message || t('googleError') || 'Google bilan kirishda xatolik');
      } finally {
        setBusy(false);
      }
    },
    [busy, googleLogin, router, t]
  );

  useEffect(() => {
    credentialRef.current = handleCredential;
  });

  useEffect(() => {
    if (!CLIENT_ID || bootstrapped.current) return;
    bootstrapped.current = true;

    const initId = () => {
      const id = window.google?.accounts?.id;
      if (!id) return false;
      id.initialize({
        client_id: CLIENT_ID,
        ux_mode: 'popup',
        auto_select: false,
        login_uri: window.location.origin,
        callback: (r: unknown) => credentialRef.current(r as GsiResponse),
      });
      id.disableAutoSelect();
      return true;
    };

    if (initId()) {
      queueMicrotask(() => setLoadState('ready'));
      return;
    }

    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => {
      if (initId()) {
        setLoadState('ready');
      } else {
        setLoadState('error');
      }
    };
    s.onerror = () => setLoadState('error');
    document.head.appendChild(s);
  }, []);

  const retry = () => {
    setLoadState('loading');
    setError(null);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => {
      const id = window.google?.accounts?.id;
      if (!id) {
        setLoadState('error');
        return;
      }
      id.initialize({
        client_id: CLIENT_ID,
        ux_mode: 'popup',
        auto_select: false,
        login_uri: window.location.origin,
        callback: (r: unknown) => credentialRef.current(r as GsiResponse),
      });
      id.disableAutoSelect();
      setLoadState('ready');
    };
    s.onerror = () => setLoadState('error');
    document.head.appendChild(s);
  };

  const triggerGoogle = useCallback(() => {
    if (busy || loadState !== 'ready') return;
    const id = window.google?.accounts?.id;
    if (!id) {
      setLoadState('error');
      return;
    }
    setError(null);

    try {
      id.prompt((n) => {
        if (!n) return;
        const hiddenOrSkipped = !!n.isNotDisplayed?.() || !!n.isSkippedMoment?.();
        if (hiddenOrSkipped) {
          // Google One Tap ko'rsatilmadi (masalan, Google seansi yo'q) —
          // g_state tozalanib keyingi bosishda qayta urinishga ruxsat beriladi
          try {
            document.cookie = 'g_state=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          } catch {
            /* ignore */
          }
          if (n.getNotDisplayedReason?.() === 'opt_out_or_no_session') {
            setError(t('googleNoSession') || 'Google hisobingizda ochiq seans topilmadi');
          }
        }
      });
    } catch {
      /* prompt ishga tushmasa — hech narsa buzilmaydi */
    }
  }, [busy, loadState, t]);

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
      <div className="relative w-full" style={{ minHeight: 52 }}>
        {loadState === 'ready' ? (
          <button
            type="button"
            onClick={triggerGoogle}
            disabled={busy}
            aria-label={mode === 'signup' ? t('googleSignup') : t('googleLogin')}
            className="google-btn"
          >
            {busy ? (
              <>
                <Loader2 size={17} className="animate-spin text-neon-cyan" />
                <span>{t('googleLoading') || 'Google orqali kirilmoqda...'}</span>
              </>
            ) : (
              <>
                <GoogleIcon className="h-[18px] w-[18px] shrink-0" />
                <span>{mode === 'signup' ? t('googleSignup') : t('googleLogin')}</span>
              </>
            )}
          </button>
        ) : (
          <div
            className={`absolute inset-0 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-cyber-900/40 text-sm text-gray-400 ${
              loadState === 'error' ? '' : 'pointer-events-none'
            }`}
          >
            {loadState === 'error' ? (
              <button
                type="button"
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

      {error && (
        <p className="mt-2.5 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
        </p>
      )}
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a7.13 7.13 0 0 1-3.09 4.67v3.89h5C21.7 20.98 23.5 16.95 23.5 12.27z"
      />
      <path
        fill="#34A853"
        d="M12 24c2.98 0 5.45-.98 7.27-2.66l-3.88-2.98c-1.08.73-2.47 1.16-3.4 1.16-3.3 0-6.08-2.23-7.08-5.2H1.01v3.05A11.96 11.96 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M4.93 16.32A7.2 7.2 0 0 1 4.5 12c0-.8.15-1.56.42-2.32V6.63H1.99A11.93 11.93 0 0 0 .59 12a11.9 11.9 0 0 0 1.4 5.37l2.94-3.05z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.07.56 4.22 1.66l3.13-3.13A11.94 11.94 0 0 0 12 0 11.96 0 0 0 1.01 6.63l3.94 3.04C4.91 6.48 7.7 4.75 12 4.75z"
      />
    </svg>
  );
}