'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, Zap, Fingerprint, ShieldCheck } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { AuthResponse, User } from '@/lib/types';
import GoogleButton from '@/components/auth/GoogleButton';
import Logo from '@/components/brand/Logo';
import { finishPasskeyLogin, passwordlessLogin, supportsBiometric } from '@/lib/webauthn';

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
  const setAuth = useAuthStore((s) => s.setAuth);
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  // Blok holati serverdan keladi (lockedUntil + serverNow). offset orqali frontend
  // soatiga tayanmasdan qolgan vaqtni hisoblaymiz; refresh'da localStorage'dan tiklanadi.
  const [lock, setLock] = useState<{ email: string; until: number; offset: number } | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  // WebAuthn: PASSKEY_REQUIRED ikkinchi bosqich / passwordless holati
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [passkeyStep, setPasskeyStep] = useState<{ email: string; pendingLoginToken: string } | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  // TOTP 2FA ikkinchi bosqichi
  const [twoFactorStep, setTwoFactorStep] = useState<{ pendingLoginToken: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpError, setTotpError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const emailValue = useWatch({ control, name: 'email' }) ?? '';

  useEffect(() => {
    supportsBiometric().then(setBiometricAvailable).catch(() => setBiometricAvailable(false));
  }, []);

  // MUST_CHANGE_PASSWORD holatini komponent tepasida qayta ishga tushirish (navigation uzoq)
  useEffect(() => {
    // agar user mustChangePassword=true bo'lsa, yangi parol sahifasiga yo'naltiramiz
    const u = useAuthStore.getState().user;
    if (u?.mustChangePassword) {
      router.replace('/set-new-password');
    }
  }, [router]);

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

  // Paroldan keyin 2-bosqich: passkey so'rov bajarish (finall append).
  async function runPasskeySecondStep() {
    if (!passkeyStep) return;
    setPasskeyBusy(true);
    setPasskeyError(null);
    try {
      const result = await finishPasskeyLogin(passkeyStep.email, passkeyStep.pendingLoginToken);
      if (result.success) {
        setPasskeyStep(null);
        const user = useAuthStore.getState().user;
        if (user?.mustChangePassword) {
          router.replace('/set-new-password');
          return;
        }
        if (user && user.role === 'SUPER_ADMIN') router.push('/super-admin');
        else router.push(user && user.role !== 'USER' ? '/admin' : '/dashboard');
        router.refresh();
      } else {
        setPasskeyError(result.message || 'Passkey tekshiruvi bajarilmadi');
      }
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
      setPasskeyError(
        data?.message || 'Brauzer bilan bog&apos;lanishda xatolik. Passkey ushbu qurilmada mavjudligiga ishonch hosil qiling.'
      );
    } finally {
      setPasskeyBusy(false);
    }
  }

  // Paroldan keyin 2-bosqich: TOTP kodni tekshirish (autentifikator ilovasi)
  async function submitTotp() {
    if (!twoFactorStep) return;
    setTotpBusy(true);
    setTotpError(null);
    try {
      const { data } = await api.post<{
        success: boolean;
        data: AuthResponse & { user?: User; mustChangePassword?: boolean };
        code?: string;
        message?: string;
      }>('/api/auth/2fa/verify', { pendingLoginToken: twoFactorStep.pendingLoginToken, code: totpCode.trim() });

      if (data?.success && data?.data?.accessToken) {
        setAuth(data.data);
        setTwoFactorStep(null);
        setTotpCode('');
        const user = data.data.user || useAuthStore.getState().user;
        if (user?.mustChangePassword) {
          router.replace('/set-new-password');
        } else if (user && user.role === 'SUPER_ADMIN') router.push('/super-admin');
        else router.push(user && user.role !== 'USER' ? '/admin' : '/dashboard');
        router.refresh();
      } else {
        setTotpError(data?.message || "Kod noto'g'ri. Qayta urinib ko'ring.");
      }
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
      setTotpError(data?.message || 'Kod tekshiruvida xatolik yuz berdi');
    } finally {
      setTotpBusy(false);
    }
  }

  // Passwordless (Faollashtirish) — email kiritilgan bo'lsa
  async function launchPasswordless() {
    const email = getValues('email').trim().toLowerCase();
    if (!email) {
      setError('Avval email kiriting, so&apos;ng "Barmoq izi/Face ID bilan kirish" tugmasini bosing.');
      return;
    }
    setPasskeyBusy(true);
    setError(null);
    setPasskeyError(null);
    try {
      const result = await passwordlessLogin(email);
      if (result.success) {
        const user = useAuthStore.getState().user;
        if (user?.mustChangePassword) {
          router.replace('/set-new-password');
        } else if (user && user.role === 'SUPER_ADMIN') router.push('/super-admin');
        else router.push(user && user.role !== 'USER' ? '/admin' : '/dashboard');
        router.refresh();
      } else {
        setPasskeyError(result.message || 'Bu qurilmada ro&apos;yxatdan o&apos;tgan passkey topilmadi');
      }
    } catch (err: unknown) {
      const data = (err as { response?: { data?: ApiErrorData } })?.response?.data;
      setPasskeyError(data?.message || 'Brauzer bilan bog&apos;lanishda xatolik. Passkey ushbu qurilmada mavjudligiga ishonch hosil qiling.');
    } finally {
      setPasskeyBusy(false);
    }
  }

  // TOTP kodni tasdiqlash (2-bosqich) — muvaffaqiyatda tokenlar beriladi
  async function verifyTwoFactorCode() {
    if (!twoFactorStep) return;
    if (!totpCode.trim()) {
      setTotpError('Kodni kiriting');
      return;
    }
    setTotpBusy(true);
    setTotpError(null);
    try {
      const { data } = await api.post('/api/auth/2fa/verify', {
        pendingLoginToken: twoFactorStep.pendingLoginToken,
        code: totpCode.trim(),
      });
      const payload = data?.data;
      if (payload?.accessToken) {
        setAuth(payload);
        setTwoFactorStep(null);
        setTotpCode('');
        if (payload.user?.mustChangePassword) {
          router.replace('/set-new-password');
          return;
        }
        const u = payload.user;
        if (u?.role === 'SUPER_ADMIN') router.push('/super-admin');
        else router.push(u && u.role !== 'USER' ? '/admin' : '/dashboard');
        router.refresh();
        return;
      }
      setTotpError(data?.message || "Kod noto'g'ri");
    } catch (err) {
      setTotpError(getApiErrorMessage(err, "Kodni tekshirishda xatolik"));
    } finally {
      setTotpBusy(false);
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    if (locked) return;
    setSubmitting(true);
    setError(null);
    setRemainingAttempts(null);
    const key = values.email.trim().toLowerCase();
    try {
      const result = await login(values.email, values.password);
      try {
        localStorage.setItem(LAST_EMAIL_KEY, key);
        localStorage.removeItem(LOCK_STORAGE_PREFIX + key);
      } catch {
        /* ignore */
      }

      // TWO_FACTOR_REQUIRED → TOTP kod bosqichini ko'rsatamiz
      if (result.code === 'TWO_FACTOR_REQUIRED' && result.pendingLoginToken) {
        setTotpCode('');
        setTotpError(null);
        setTwoFactorStep({ pendingLoginToken: result.pendingLoginToken });
        return;
      }

      // PASSKEY_REQUIRED → 2-bosqich passkey so'rovini ko'rsatamiz
      if (result.code === 'PASSKEY_REQUIRED' && result.userId) {
        setPasskeyStep({ email: key, pendingLoginToken: result.pendingLoginToken || '' });
        return;
      }

      // TWO_FACTOR_REQUIRED → 2-bosqich TOTP kodini ko'rsatamiz
      if (result.code === 'TWO_FACTOR_REQUIRED') {
        setTwoFactorStep({ pendingLoginToken: result.pendingLoginToken || '' });
        return;
      }

      // MUST_CHANGE_PASSWORD → yangi parol majburiy
      if (result.code === 'MUST_CHANGE_PASSWORD') {
        router.replace('/set-new-password');
        return;
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
            {biometricAvailable && <span className="chip"><Fingerprint size={12} /> Passkey</span>}
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

            {error && !passkeyStep && !twoFactorStep && (
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

            {locked && !passkeyStep && !twoFactorStep && (
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

            {passkeyError && (
              <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{passkeyError}</span>
              </div>
            )}

            {twoFactorStep ? (
              // ===== 2-BOSQICH: TOTP (autentifikator) kodi =====
              <div className="py-2">
                <div className="mx-auto w-16 h-16 rounded-2xl border border-neon-cyan/40 bg-neon-cyan/10 flex items-center justify-center mb-4 shadow-glow">
                  <ShieldCheck size={26} className="text-neon-cyan" />
                </div>
                <h2 className="text-lg font-bold mb-1 text-center">Ikki faktorli himoya</h2>
                <p className="text-sm text-gray-400 mb-5 text-center">
                  Autentifikator ilovangizdagi 6 xonali kodni kiriting.
                </p>
                {totpError && (
                  <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span>{totpError}</span>
                  </div>
                )}
                <input
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === 'Enter') verifyTwoFactorCode(); }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="glass-input w-full rounded-xl px-3 py-3 text-center text-2xl font-mono tracking-[0.4em] outline-none mb-3"
                />
                <button
                  type="button"
                  disabled={totpBusy || totpCode.length < 6}
                  onClick={verifyTwoFactorCode}
                  className="w-full py-3 rounded-xl neon-btn flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {totpBusy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                  Tasdiqlash
                </button>
                <p className="text-xs text-gray-500 mt-3 text-center">
                  Kod ishlamasa, bir martalik tiklash kodingizdan foydalanishingiz mumkin.
                </p>
                <button
                  type="button"
                  disabled={totpBusy}
                  onClick={() => {
                    setTwoFactorStep(null);
                    setTotpCode('');
                    setTotpError(null);
                  }}
                  className="mt-3 w-full py-2.5 rounded-xl border border-gray-700 text-sm text-gray-300 hover:border-neon-cyan/40 disabled:opacity-60"
                >
                  Orqaga
                </button>
              </div>
            ) : passkeyStep ? (
              // ===== 2-BOSQICH: PASSKEY (biometric) tasdiqlash =====
              <div className="text-center py-2">
                <div className="mx-auto w-16 h-16 rounded-2xl border border-neon-cyan/40 bg-neon-cyan/10 flex items-center justify-center mb-4 shadow-glow animate-floaty">
                  {passkeyBusy ? <Loader2 size={26} className="animate-spin text-neon-cyan" /> : <Fingerprint size={26} className="text-neon-cyan" />}
                </div>
                <h2 className="text-lg font-bold mb-1">Xavfsizlik tasdiqlashi</h2>
                <p className="text-sm text-gray-400 mb-5">
                  Parol kiritildi. Endi <b className="text-neon-cyan">{passkeyStep.email}</b> akkauntida
                  passkey (Face ID / barmoq izi) bilan tasdiqlang.
                </p>
                <button
                  type="button"
                  disabled={passkeyBusy}
                  onClick={runPasskeySecondStep}
                  className="w-full py-3 rounded-xl neon-btn flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {passkeyBusy ? <Loader2 size={18} className="animate-spin" /> : <Fingerprint size={18} />}
                  Passkey bilan tasdiqlash
                </button>
                <button
                  type="button"
                  disabled={passkeyBusy}
                  onClick={() => {
                    setPasskeyStep(null);
                    setPasskeyError(null);
                  }}
                  className="mt-3 w-full py-2.5 rounded-xl border border-gray-700 text-sm text-gray-300 hover:border-neon-cyan/40 disabled:opacity-60"
                >
                  Bekor qilish
                </button>
              </div>
            ) : twoFactorStep ? (
              // ===== 2-BOSQICH: TOTP (autentifikator ilovasi) =====
              <div className="text-center py-2">
                <div className="mx-auto w-16 h-16 rounded-2xl border border-neon-cyan/40 bg-neon-cyan/10 flex items-center justify-center mb-4 shadow-glow animate-floaty">
                  {totpBusy ? <Loader2 size={26} className="animate-spin text-neon-cyan" /> : <ShieldCheck size={26} className="text-neon-cyan" />}
                </div>
                <h2 className="text-lg font-bold mb-1">Ikki faktorli tekshiruv</h2>
                <p className="text-sm text-gray-400 mb-5">
                  Hisobingizda <b className="text-neon-cyan">2FA</b> yoqilgan. Autentifikator
                  ilovasidagi (Google Authenticator va h.k.) 6 xonali kodni kiriting.
                </p>

                {totpError && (
                  <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span>{totpError}</span>
                  </div>
                )}

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitTotp();
                    }
                  }}
                  placeholder="000000"
                  className="glass-input w-full mx-auto rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono outline-none mb-4"
                  disabled={totpBusy}
                  aria-label="6 xonali autentifikator kodi"
                  autoFocus
                />

                <button
                  type="button"
                  disabled={totpBusy || totpCode.length < 6}
                  onClick={submitTotp}
                  className="w-full py-3 rounded-xl neon-btn flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {totpBusy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                  Tasdiqlash
                </button>
                <button
                  type="button"
                  disabled={totpBusy}
                  onClick={() => {
                    setTwoFactorStep(null);
                    setTotpCode('');
                    setTotpError(null);
                  }}
                  className="mt-3 w-full py-2.5 rounded-xl border border-gray-700 text-sm text-gray-300 hover:border-neon-cyan/40 disabled:opacity-60"
                >
                  Bekor qilish
                </button>
              </div>
            ) : (
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
            )}

            {!passkeyStep && !twoFactorStep && (
              <>
                <div className="flex items-center gap-3 my-6">
                  <div className="h-px flex-1 bg-neon-cyan/15" />
                  <span className="text-xs text-gray-500">{t('or')}</span>
                  <div className="h-px flex-1 bg-neon-cyan/15" />
                </div>

                {biometricAvailable && (
                  <button
                    type="button"
                    disabled={passkeyBusy}
                    onClick={launchPasswordless}
                    className="w-full mb-3 py-3 rounded-xl border border-neon-green/40 bg-neon-green/5 text-neon-green hover:bg-neon-green/10 flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-60 transition-colors"
                  >
                    {passkeyBusy ? <Loader2 size={18} className="animate-spin" /> : <Fingerprint size={18} />}
                    Passkey (Face ID / barmoq izi) bilan kirish
                  </button>
                )}

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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}