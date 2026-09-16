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

export default function GoogleButton() {
  const t = useTranslations('auth');
  const router = useRouter();
  const googleLogin = useAuthStore((s) => s.googleLogin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!CLIENT_ID || !boxRef.current || initialized.current) return;
    initialized.current = true;

    const start = () => {
      if (!window.google?.accounts?.id || !boxRef.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        ux_mode: 'popup',
        callback: async (response: { credential?: string }) => {
          if (!response?.credential) return;
          setBusy(true);
          setError(null);
          try {
            const res = await googleLogin(response.credential);
            const data = res?.data?.data;
            if (data?.pendingRegister) {
              // Bazada bunday user yo'q → ro'yhatdan o'tishga (avtoto'ldirilgan holda)
              sessionStorage.setItem('google_prefill', JSON.stringify(data.profile || {}));
              router.push(`/register?google=prefill`);
              return;
            }
            const user = useAuthStore.getState().user;
            if (user?.role === 'SUPER_ADMIN') router.push('/super-admin');
            else if (user?.role !== 'USER') router.push('/admin');
            else router.push('/dashboard');
            router.refresh();
          } catch (err: any) {
            setError(err?.response?.data?.message || t('googleError') || 'Google bilan kirishda xatolik');
          } finally {
            setBusy(false);
          }
        },
      });
      window.google.accounts.id.renderButton(boxRef.current, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        width: 320,
        text: 'signin_with',
        shape: 'pill',
        logo_alignment: 'left',
      });
      window.google.accounts.id.disableAutoSelect();
    };

    if (window.google?.accounts?.id) {
      start();
    } else {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = start;
      document.head.appendChild(s);
    }
  }, [googleLogin, router, t]);

  if (!CLIENT_ID) {
    return (
      <div>
        <p className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {t('googleSetup') || 'Google OAuth Client ID o\u2019rnatilmagan. NEXT_PUBLIC_GOOGLE_CLIENT_ID belgilang.'}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        ref={boxRef}
        className={`overflow-hidden rounded-xl w-full max-w-[320px] mx-auto ${busy ? 'opacity-60 pointer-events-none' : ''}`}
      />
      {busy && (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-gray-400">
          <Loader2 size={14} className="animate-spin" /> {t('googleLoading') || 'Google orqali kirilmoqda...'}
        </div>
      )}
      {error && (
        <p className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
        </p>
      )}
    </div>
  );
}