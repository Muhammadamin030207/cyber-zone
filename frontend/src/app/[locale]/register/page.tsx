'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, Mail, Lock, User as UserIcon, Eye, EyeOff, Loader2, AlertCircle, Zap } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuthStore } from '@/store/auth';
import PhoneInput, { phoneToDigits, isValidUzbekPhone } from '@/components/auth/PhoneInput';
import GoogleButton from '@/components/auth/GoogleButton';
import Logo from '@/components/brand/Logo';

const registerSchema = z
  .object({
    fullName: z.optional(z.string()),
    email: z.optional(z.string()),
    phone: z.optional(z.string()).refine(
      (v) => !v || v === '+998 ' || isValidUzbekPhone(v),
      { message: 'Telefon +998 XX XXX XX XX formatda' }
    ),
    password: z.optional(z.string()),
  })
  .superRefine((data, ctx) => {
    if (!isGoogleFlow() && !data.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'Kamida 6 ta belgi' });
    }
    if (data.password && data.password.length < 6) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'Kamida 6 ta belgi' });
    }
    if (!isGoogleFlow() && (!data.fullName || data.fullName.length < 3)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fullName'], message: 'Kamida 3 ta belgi' });
    }
    if (!isGoogleFlow() && (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: 'Email noto\u2019g\u2019ri' });
    }
  });

function isGoogleFlow() {
  if (typeof window === 'undefined') return false;
  try {
    return !!sessionStorage.getItem('google_token');
  } catch {
    return false;
  }
}

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  void params;
  const t = useTranslations('auth');
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGoogle, setIsGoogle] = useState(false);
  const [googleProfile, setGoogleProfile] = useState<{ fullName?: string; email?: string; avatarUrl?: string } | null>(null);

  const {
    register: field,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', phone: '', password: '' },
  });

  // Google bilan kirishda bazada topilmagan user -> avtoto'ldirish
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('google_prefill');
      if (!raw) return;
      const profile = JSON.parse(raw);
      if (profile.fullName) setValue('fullName', profile.fullName);
      if (profile.email) setValue('email', profile.email);
      setGoogleProfile({
        fullName: profile.fullName,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
      });
      setIsGoogle(true);
      sessionStorage.removeItem('google_prefill');
    } catch {
      /* ignore */
    }
  }, [setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setError(null);
    let googleToken: string | undefined;
    try {
      if (isGoogle) {
        googleToken = sessionStorage.getItem('google_token') || undefined;
      }
      await register({
        fullName: values.fullName || '',
        email: values.email || '',
        phone: values.phone && values.phone !== '+998 ' ? phoneToDigits(values.phone) : undefined,
        password: isGoogle && !values.password ? undefined : values.password,
        googleToken,
      });
      if (isGoogle) {
        try { sessionStorage.removeItem('google_token'); } catch { /* ignore */ }
      }
      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Ro\u2019yxatdan o\u2019tishda xatolik");
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
        <div className="orb w-80 h-80 bg-neon-purple/15 -top-10 -right-10 animate-floaty" />
        <div className="orb w-72 h-72 bg-neon-cyan/10 bottom-20 -left-12 animate-floaty" style={{ animationDelay: '2s' }} />
        <div className="orb w-56 h-56 bg-neon-magenta/10 top-1/3 -right-16 animate-floaty" style={{ animationDelay: '3.5s' }} />

        <div className="relative flex items-center gap-3">
          <Logo size={44} />
          <span className="font-[--font-orbitron] text-xl font-bold tracking-widest neon-text">
            CYBER<span className="text-white">-ZONE</span>
          </span>
        </div>

        <div className="relative">
          <div className="w-16 h-16 rounded-2xl border border-neon-purple/30 bg-neon-purple/10 flex items-center justify-center mb-6 shadow-glow animate-floaty">
            <UserPlus size={28} className="text-neon-purple" />
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight mb-3">{t('registerTitle')}</h2>
          <p className="text-gray-400 max-w-md leading-relaxed">
            Akkaunt yarating, kompyuter xonalarini bron qiling yoki o'z xonangizni platformaga qo'shing.
          </p>
          <div className="flex flex-wrap gap-2 mt-6">
            <span className="chip chip-success"><Zap size={12} /> Tez bron</span>
            <span className="chip chip-warn">Google orqali kirish</span>
            <span className="chip">3 til</span>
          </div>
        </div>

        <div className="relative text-xs text-gray-500">© 2026 Cyber-ZONE. All rights reserved.</div>
      </div>

      {/* ===== Form panel ===== */}
      <div className="flex items-center justify-center px-4 sm:px-6 py-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <Logo size={38} />
            <span className="font-[--font-orbitron] text-lg font-bold tracking-widest neon-text">
              CYBER<span className="text-white">-ZONE</span>
            </span>
          </div>

          <div className="neo-card rounded-2xl p-8 animate-fade-up relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-neon-purple to-transparent" />
            <h1 className="text-2xl font-extrabold tracking-tight mb-1">{t('registerTitle')}</h1>
            <p className="text-sm text-gray-400 mb-6">
              {t('haveAccount')}{' '}
              <Link href="/login" className="text-neon-cyan hover:underline font-medium">
                {t('loginTitle')}
              </Link>
            </p>

            {error && (
              <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {isGoogle && googleProfile && (
              <div className="mb-4 p-3 rounded-xl border border-neon-cyan/25 bg-neon-cyan/10">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-neon-cyan/40 bg-cyber-800 shrink-0 grid place-items-center">
                    {googleProfile.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={googleProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon size={20} className="text-neon-cyan" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{googleProfile.fullName}</p>
                    <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                      <Mail size={11} /> {googleProfile.email}
                    </p>
                  </div>
                  <span className="ml-auto text-[10px] px-2 py-1 rounded-full bg-neon-cyan/15 text-neon-cyan font-bold uppercase tracking-wider shrink-0">
                    Google
                  </span>
                </div>
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4">
              {!isGoogle && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('fullName')}</label>
                    <div className="relative">
                      <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        {...field('fullName')}
                        type="text"
                        autoComplete="name"
                        className="glass-input w-full rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none"
                        placeholder="John Doe"
                      />
                    </div>
                    {errors.fullName && <p className="text-xs text-red-400 mt-1">{errors.fullName.message}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('email')}</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        {...field('email')}
                        type="email"
                        autoComplete="email"
                        className="glass-input w-full rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none"
                        placeholder="you@example.com"
                      />
                    </div>
                    {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>}
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  {t('phone')}
                  {isGoogle && <span className="text-xs text-gray-500 font-normal ml-1">(ixtiyoriy)</span>}
                </label>
                <PhoneInput
                  value={watch('phone') || ''}
                  onChange={(v) => setValue('phone', v)}
                />
                {errors.phone && <p className="text-xs text-red-400 mt-1">{errors.phone.message}</p>}
              </div>

              {!isGoogle && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('password')}</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      {...field('password')}
                      type={showPass ? 'text' : 'password'}
                      autoComplete="new-password"
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
                </div>
              )}

              {isGoogle && (
                <p className="text-xs text-gray-500 leading-relaxed">
                  Parol kiritish shart emas — siz Gmail akkauntingiz orqali kirasiz (parol bu holatda
                  Google akkauntingizning parolidir). Keyinchalik parolni tiklash kerak bo&apos;lsa,
                  kirish sahifasidagi &laquo;Parol unutdingizmi?&raquo; bo&apos;limidan foydalaning.
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl neon-btn flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
                {isGoogle ? 'Yakunlash' : t('registerBtn')}
              </button>
            </form>

              {/* Divider */}
              <div className="flex items-center gap-3 my-6">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs text-gray-500 font-medium">{t('or') || 'yoki'}</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              {!isGoogle && <GoogleButton mode="signup" />}
              {isGoogle && (
                <p className="text-center text-xs text-gray-500">
                  Akkaunt yaratishni bekor qilib, boshqa usul bilan kirmoqchimisiz?{' '}
                  <Link href="/login" className="text-neon-cyan hover:underline font-medium">
                    Kirish sahifasi
                  </Link>
                </p>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}