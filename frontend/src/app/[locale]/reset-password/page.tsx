'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Lock, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import api, { getApiErrorMessage } from '@/lib/api';
import Logo from '@/components/brand/Logo';

export default function ResetPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  void params;
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError('Yangi parol kamida 6 ta belgidan iborat bo\'lishi kerak');
    if (password !== confirm) return setError('Parollar bir-biriga mos kelmadi');
    setSubmitting(true);
    try {
      const { data } = await api.post('/api/auth/reset-password', { token, newPassword: password });
      setDone(data?.message || 'Parol muvaffaqiyatli tiklandi');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6">
      <div className="absolute inset-0 bg-aurora" />
      <div className="absolute inset-0 grid-matrix opacity-20" />
      <div className="orb w-72 h-72 bg-neon-green/10 top-10 -right-10 animate-floaty" />
      <div className="orb w-64 h-64 bg-neon-purple/10 bottom-10 -left-12 animate-floaty" style={{ animationDelay: '2s' }} />

      <div className="relative w-full max-w-md">
        <div className="lg:hidden flex items-center justify-center gap-2 mb-6">
          <Logo size={36} />
          <span className="font-[--font-orbitron] text-lg font-bold tracking-widest neon-text">
            CYBER<span className="text-white">-ZONE</span>
          </span>
        </div>

        <div className="neo-card rounded-2xl p-8 animate-fade-up relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-neon-green to-transparent" />
          <div className="w-12 h-12 rounded-xl border border-neon-green/30 bg-neon-green/10 flex items-center justify-center mb-5 shadow-glow">
            <KeyRound size={22} className="text-neon-green" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight mb-1">Yangi parol</h1>
          <p className="text-sm text-gray-400 mb-6">Yangi parolni kiriting va saqlang.</p>

          {done ? (
            <div>
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-neon-green/10 border border-neon-green/30 text-sm text-neon-green mb-4">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <span>{done}</span>
              </div>
              <button
                onClick={() => { router.push('/login'); router.refresh(); }}
                className="block w-full text-center py-3 rounded-xl neon-btn text-sm font-bold transition-transform hover:scale-[1.01] active:scale-[0.99]"
              >
                Kirish sahifasiga o&apos;tish
              </button>
            </div>
          ) : !token ? (
            <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
              Havola noto&apos;g&apos;ri yoki eskirgan. Parolni tiklashni qaytadan boshlang.
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Yangi parol</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Parolni takrorlang</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    className="glass-input w-full rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !password || !confirm}
                className="w-full py-3 rounded-xl neon-btn flex items-center justify-center gap-2 disabled:opacity-60 transition-transform hover:scale-[1.01] active:scale-[0.99]"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />}
                Parolni saqlash
              </button>
            </form>
          )}

          <p className="text-center text-xs text-gray-500 mt-5">
            <Link href="/login" className="text-neon-cyan hover:underline font-medium">
              Kirish sahifasi
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}