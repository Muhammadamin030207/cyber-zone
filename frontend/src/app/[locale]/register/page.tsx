'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Gamepad2, UserPlus, Mail, Lock, User as UserIcon, Phone, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuthStore } from '@/store/auth';
import PhoneInput, { phoneToDigits, isValidUzbekPhone } from '@/components/auth/PhoneInput';
import GoogleButton from '@/components/auth/GoogleButton';

const registerSchema = z.object({
  fullName: z.string().min(3, 'Kamida 3 ta belgi'),
  email: z.string().min(1, 'Email kiriting').email('Email noto\u2019g\u2019ri'),
  phone: z.optional(z.string()).refine(
    (v) => !v || v === '+998 ' || isValidUzbekPhone(v),
    { message: 'Telefon +998 XX XXX XX XX formatda' }
  ),
  password: z.string().min(6, 'Kamida 6 ta belgi'),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  void params;
  const t = useTranslations('auth');
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      sessionStorage.removeItem('google_prefill');
    } catch {
      /* ignore */
    }
  }, [setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setError(null);
    try {
      await register({
        fullName: values.fullName,
        email: values.email,
        phone: values.phone && values.phone !== '+998 ' ? phoneToDigits(values.phone) : undefined,
        password: values.password,
      });
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
        <div className="absolute inset-0 grid-matrix opacity-50" />
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-neon-purple/10 blur-3xl" />
        <div className="absolute bottom-0 -left-24 w-96 h-96 rounded-full bg-neon-cyan/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl neon-btn flex items-center justify-center">
            <Gamepad2 size={26} />
          </div>
          <span className="font-[--font-orbitron] text-xl font-bold tracking-widest neon-text">
            CYBER<span className="text-white">-ZONE</span>
          </span>
        </div>

        <div className="relative">
          <UserPlus size={48} className="text-neon-purple mb-6 animate-float" />
          <h2 className="text-3xl font-extrabold tracking-tight mb-3">{t('registerTitle')}</h2>
          <p className="text-gray-400 max-w-md leading-relaxed">
            Akkaunt yarating, kompyuter xonalarini bron qiling yoki o\u2019z xonangizni platformaga qo\u2019shing.
          </p>
        </div>

        <div className="relative text-xs text-gray-500">© 2026 Cyber-ZONE. All rights reserved.</div>
      </div>

      {/* ===== Form panel ===== */}
      <div className="flex items-center justify-center px-4 sm:px-6 py-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl neon-btn flex items-center justify-center">
              <Gamepad2 size={22} />
            </div>
            <span className="font-[--font-orbitron] text-lg font-bold tracking-widest neon-text">
              CYBER<span className="text-white">-ZONE</span>
            </span>
          </div>

          <div className="neo-card rounded-2xl p-8">
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

            <form onSubmit={onSubmit} className="space-y-4">
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

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('phone')}</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 z-10" />
                  <PhoneInput
                    value={watch('phone') || ''}
                    onChange={(v) => setValue('phone', v)}
                    className="pl-10"
                  />
                </div>
                {errors.phone && <p className="text-xs text-red-400 mt-1">{errors.phone.message}</p>}
              </div>

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

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl neon-btn flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
                {t('registerBtn')}
              </button>
</form>

              {/* Divider */}
              <div className="flex items-center gap-3 my-6">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs text-gray-500 font-medium">{t('or') || 'yoki'}</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <GoogleButton />
            </div>
        </div>
      </div>
    </div>
  );
}