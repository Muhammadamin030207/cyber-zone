'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, Loader2, AlertCircle, CheckCircle2, KeyRound, RefreshCw } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import Logo from '@/components/brand/Logo';

const RESEND_COOLDOWN = 60;

export default function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  void params;
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; devTempPassword?: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const submit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (submitting || !email) return;
    setSubmitting(true);
    setError(null);
    setDone(null);
    try {
      const { data } = await api.post('/api/auth/forgot-password', { email });
      setDone({
        message: data?.message || 'Vaqtinchalik parol emailingizga yuborildi',
        devTempPassword: data?.data?.devTempPassword,
      });
      setCooldown(RESEND_COOLDOWN);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [email, submitting]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 py-10">
      <div className="w-full max-w-md">
        <div className="lg:hidden flex items-center justify-center gap-2 mb-6">
          <Logo size={36} />
          <span className="font-[--font-orbitron] text-lg font-bold tracking-wide neon-text">
            CYBER<span className="text-white">-ZONE</span>
          </span>
        </div>

        <div className="neo-card rounded-2xl p-6 sm:p-8">
          <div className="w-12 h-12 rounded-xl border border-neon-cyan/25 bg-neon-cyan/10 flex items-center justify-center mb-5">
            <KeyRound size={22} className="text-neon-cyan" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight mb-1">Parolni tiklash</h1>
          <p className="text-sm text-gray-400 mb-6">
            Emailingizni kiriting — <b className="text-neon-cyan">vaqtinchalik parol</b> yuboramiz.
            Bu parol bilan kirib, darhol yangi parol o&apos;rnatasiz.
          </p>

          {done ? (
            <div>
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-neon-green/10 border border-neon-green/30 text-sm text-neon-green mb-4">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <span>{done.message}</span>
              </div>
              {done.devTempPassword && (
                <div className="px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 mb-4 break-all">
                  <b>Dev (sinov) vaqtinchalik parol:</b>{' '}
                  <code className="font-mono font-bold">{done.devTempPassword}</code>
                </div>
              )}
              <div className="mb-4 px-3 py-2.5 rounded-lg bg-neon-cyan/5 border border-neon-cyan/20 text-xs text-gray-300 leading-relaxed">
                Kirishda so&apos;ralgan yangi parol oynasida xohlagan parolingizni o&apos;rnating.
                Bitta parol faqat bitta kirishda ishlatiladi.
              </div>
              <div className="mb-4 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-gray-300 leading-relaxed">
                Xat 2-3 daqiqada kelishi kerak. <b>Kelmagan bo&apos;lsa — Spam / Junk</b> papkasini
                tekshiring, yoki quyidagi tugma orqali qayta yuboring.
              </div>
              <button
                type="button"
                disabled={submitting || cooldown > 0}
                onClick={() => submit()}
                className="w-full mb-3 py-3 rounded-xl border border-neon-cyan/40 bg-neon-cyan/5 text-neon-cyan hover:bg-neon-cyan/10 flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <RefreshCw size={18} />
                )}
                {cooldown > 0 ? `Qayta yuborish (${cooldown}s)` : 'Qayta yuborish'}
              </button>
              <Link href="/login" className="block w-full text-center py-3 rounded-xl neon-btn text-sm font-bold">
                Kirish sahifasiga qaytish
              </Link>
            </div>
          ) : (
            <form onSubmit={(e) => submit(e)} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('email')}</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    className="glass-input w-full rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none"
                    placeholder="you@example.com"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting || !email}
                className="w-full py-3 rounded-xl neon-btn flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
                Vaqtinchalik parol yuborish
              </button>
            </form>
          )}

          <p className="text-center text-xs text-gray-500 mt-5">
            Esingizdamimas?{' '}
            <Link href="/login" className="text-neon-cyan hover:underline font-medium">
              Kirish
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}