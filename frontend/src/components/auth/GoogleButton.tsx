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

export default function GoogleButton({ mode = 'signin', className = '' }: GoogleButtonProps) {
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
            await googleLogin(response.credential);
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

      // Hisoblash: container eni (360-380px oralig'ida)
      const containerWidth = Math.min(380, Math.max(280, boxRef.current.clientWidth || 360));

      window.google.accounts.id.renderButton(boxRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        width: containerWidth,
        text: mode === 'signup' ? 'signup_with' : 'signin_with',
        shape: 'rectangular',
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
      <div className="relative flex flex-col items-center justify-center">
        <div
          ref={boxRef}
          className={`overflow-hidden rounded-xl w-full flex justify-center items-center min-h-[44px] transition-opacity ${
            busy ? 'opacity-50 pointer-events-none' : 'opacity-100'
          }`}
        />

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-white bg-black/60 rounded-xl backdrop-blur-xs font-medium">
            <Loader2 size={16} className="animate-spin text-neon-cyan" /> {t('googleLoading') || 'Google orqali ulanmoqda...'}
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