'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, Zap } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuthStore } from '@/store/auth';
import GoogleButton from '@/components/auth/GoogleButton';
import Logo from '@/components/brand/Logo';

const loginSchema = z.object({
  email: z.string().min(1, 'Email kiriting').email('Email noto\u2019g\u2019ri'),
  password: z.string().min(6, 'Kamida 6 ta belgi'),
});

type LoginForm = z.infer<typeof loginSchema>;

interface ApiErrorData {
  message?: string;
  code?: string;
  lockedUntil?: string;
  serverNow?: string;
  retryAfterSeconds?: number;
  remainingAttempts?: number;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const LOCK_STORAGE_PREFIX = 'cz-login-lock:';
const LAST_EMAIL_KEY = 'cz-login-last-email';

export default function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  void params;
  const t = useTranslations('auth');
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  // Blok holati serverdan keladi (lockedUntil + serverNow). offset orqali frontend
  // soatiga tayanmasdan qolgan vaqtni hisoblaymiz; refresh'da localStorage'dan tiklanadi.
  const [lock, setLock] = useState<{ email: string; until: number; offset: number } | null>(null);
  const [tick, setTick] = useState(() => Date.now());

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const emailValue = useWatch({ control, name: 'email' }) ?? '';

  // Sahifa qayta ochilganda (refresh) blok holatini tiklash
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem(LAST_EMAIL_KEY) || '';
      if (!savedEmail) return;
      setValue('email', savedEmail);
      const raw = localStorage.getItem(LOCK_STORAGE_PREFIX + savedEmail);
      if (raw) {
        const parsed = JSON.parse(raw) as { lockedUntil?: number; serverOffset?: number };
        if (parsed.lockedUntil) {
          setLock({ email: savedEmail, until: parsed.lockedUntil, offset: parsed.serverOffset || 0 });
        }
      }
    } catch {
      /* localStorage mavjud emas — e'tiborsiz */
    }
  }, [setValue]);

  // Real-time countdown (serverdan olingan mutlaq vaqt asosida)
  useEffect(() => {
    if (!lock) return;
    const id = setInterval(() => {
      setTick(Date.now());
      if (lock.until - (Date.now() - lock.offset) <= 0) {
        clearInterval(id);
        setLock(null);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lock]);

  const emailKey = emailValue.trim().toLowerCase();
  const activeLock = lock && lock.email === emailKey ? lock : null;
  const remainingMs = activeLock ? Math.max(0, activeLock.until - (tick - activeLock.offset)) : 0;
  const locked = remainingMs > 0;

  const onSubmit = handleSubmit(async (values) => {
    if (locked) return;
    setSubmitting(true);
    setError(null);
    setRemainingAttempts(null);
    const key = values.email.trim().toLowerCase();
    try {
      await login(values.email, values.password);
      try {
        localStorage.setItem(LAST_EMAIL_KEY, key);
        localStorage.removeItem(LOCK_STORAGE_PREFIX + key);
      } catch {
        /* ignore */
      }
      const user = useAuthStore.getState().user;
      if (user && user.role === 'SUPER_ADMIN') router.push('/super-admin');
      else router.push(user && user.role !== 'USER' ? '/admin' : '/dashboard');
      router.refresh();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: ApiErrorData } })?.response?.data;
      try {
        localStorage.setItem(LAST_EMAIL_KEY, key);
      } catch {
        /* ignore */
      }

      if (data?.code === 'ACCOUNT_LOCKED' && data.lockedUntil) {
        const until = Date.parse(data.lockedUntil);
        const serverNow = data.serverNow ? Date.parse(data.serverNow) : Date.now();
        const offset = Date.now() - serverNow;
        setLock({ email: key, until, offset });
        setTick(Date.now());
        setError(null);
        setRemainingAttempts(null);
        try {
          localStorage.setItem(
            LOCK_STORAGE_PREFIX + key,
            JSON.stringify({ lockedUntil: until, serverOffset: offset })
          );
        } catch {
          /* ignore */
        }
      } else {
        setError(data?.message || t('invalid'));
        if (typeof data?.remainingAttempts === 'number') setRemainingAttempts(data.remainingAttempts);
      }
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <div className="min-h-screen grid lg:grid-cols-2 items-stretch">
      {/* ===== Brand panel ===== */}
      <div className="relative hidden lg:flex flex-col justify-between p-10 overflow-hidden">
        <div className="absolute inset-0 bg-aurora" />
        <div className="absolute inset-0 grid-matrix opacity-30" />
        <div className="orb w-80 h-80 bg-neon-cyan/15 -top-10 -right-10 animate-floaty" />
        <div className="orb w-72 h-72 bg-neon-magenta/10 bottom-20 -left-12 animate-floaty" style={{ animationDelay: '2s' }} />
        <div className="orb w-56 h-56 bg-neon-purple/10 top-1/3 -right-16 animate-floaty" style={{ animationDelay: '3.5s' }} />

        <div className="relative flex items-center gap-3">
          <Logo size={44} />
          <span className="font-[--font-orbitron] text-xl font-bold tracking-widest neon-text">
            CYBER<span className="text-white">-ZONE</span>
          </span>
        </div>

        <div className="relative">
          <div className="w-16 h-16 rounded-2xl border border-neon-cyan/30 bg-neon-cyan/10 flex items-center justify-center mb-6 shadow-glow animate-floaty">
            <LogIn size={28} className="text-neon-cyan" />
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight mb-3">{t('welcome')}</h2>
          <p className="text-gray-400 max-w-md leading-relaxed">
            {t('loginTitle')} va kompyuter xonangizni boshqaring.
          </p>
          <div className="flex flex-wrap gap-2 mt-6">
            <span className="chip chip-success"><Zap size={12} /> 24/7 bron</span>
            <span className="chip chip-warn">Online to&apos;lov</span>
            <span className="chip">O&apos;zbek · Русский · English</span>
          </div>
        </div>

        <div className="relative text-xs text-gray-500">
          © 2026 Cyber-ZONE. All rights reserved.
        </div>
      </div>

      {/* ===== Form panel ===== */}
      <div className="flex items-center justify-center px-4 sm:px-6 py-10">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <Logo size={38} />
            <span className="font-[--font-orbitron] text-lg font-bold tracking-widest neon-text">
              CYBER<span className="text-white">-ZONE</span>
            </span>
          </div>

          <div className="neo-card rounded-2xl p-8 animate-fade-up relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-neon-cyan to-transparent" />
            <h1 className="text-2xl font-extrabold tracking-tight mb-1">{t('loginTitle')}</h1>
            <p className="text-sm text-gray-400 mb-6">Hisobingiz bilan kiring va xonalarni bron qiling.</p>

            {error && (
              <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <span>{error}</span>
                  {remainingAttempts !== null && remainingAttempts > 0 && (
                    <p className="text-xs text-red-300/80 mt-1">
                      Yana {remainingAttempts} ta urinish qoldi.
                    </p>
                  )}
                </div>
              </div>
            )}

            {locked && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200"
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Juda ko&apos;p urinish. Hisob vaqtincha bloklandi.</p>
                  <p className="text-xs mt-1">
                    Qayta urinish uchun:{' '}
                    <span className="font-mono font-semibold text-amber-100 tabular-nums">
                      {formatCountdown(remainingMs)}
                    </span>
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('email')}</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    {...register('email')}
                    type="email"
                    autoComplete="email"
                    className="glass-input w-full rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none"
                    placeholder="you@example.com"
                  />
                </div>
                {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-300">{t('password')}</label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-neon-cyan hover:text-neon-green transition-colors font-medium"
                  >
                    Parol unutdingizmi?
                  </Link>
                </div>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    {...register('password')}
                    type={showPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="glass-input w-full rounded-xl pl-10 pr-10 py-2.5 text-sm outline-none"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-neon-cyan"
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>}
                {error?.includes('Google orqali yaratilgan') && (
                  <p className="text-xs text-neon-cyan mt-1.5">
                    Bu akkaunt Gmail orqali yaratilgan — yuqoridagi Google tugmasi bilan kiring.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || locked}
                aria-disabled={submitting || locked}
                className="w-full py-3 rounded-xl neon-btn flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                {locked ? `Bloklangan · ${formatCountdown(remainingMs)}` : t('loginBtn')}
              </button>
            </form>

            <div className="flex items-center gap-3 my-6">
              <div className="h-px flex-1 bg-neon-cyan/15" />
              <span className="text-xs text-gray-500">{t('or')}</span>
              <div className="h-px flex-1 bg-neon-cyan/15" />
            </div>

            <GoogleButton mode="signin" />

            {/* Ro'yxatdan o'tish — kichkina tugma (Google akkauntingiz bo'lmasa) */}
            <div className="mt-5 text-center">
              <span className="text-xs text-gray-500">Google akkauntingiz yo&apos;qmi? </span>
              <Link
                href="/register"
                className="inline-flex items-center gap-1 text-xs font-semibold text-neon-cyan hover:underline"
              >
                {t('registerTitle')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}