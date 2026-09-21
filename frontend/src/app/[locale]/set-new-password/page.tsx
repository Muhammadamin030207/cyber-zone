'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useAuthStore } from '@/store/auth';
import { KeyRound, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import Logo from '@/components/brand/Logo';
import api, { getApiErrorMessage } from '@/lib/api';

export default function SetNewPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  void params;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const token = useAuthStore((s) => s.token);
  const setNewPassword = useAuthStore((s) => s.setNewPassword);

  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Auth yo'q bo'lsa login bilan ishlash (temp parol hali berilmagan).
  // Parol muvaffaqiyatli o'rnatilgach (done) token serverda bekor qilinadi — bu holatda
  // foydalanuvchini "bajarildi" ekranida qoldiramiz.
  useEffect(() => {
    if (initialized && !token && !done) router.replace('/login');
  }, [initialized, token, done, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPass.length < 6) {
      setError('Yangi parol kamida 6 ta belgidan iborat bo\'lishi kerak');
      return;
    }
    if (newPass !== confirmPass) {
      setError('Parollar mos kelmadi');
      return;
    }
    setSubmitting(true);
    try {
      // Temp parol bilan kirilgan: currentPassword shart emas (mustChangePassword=true)
      if (user?.mustChangePassword) {
        await api.post('/api/auth/set-new-password', { newPassword: newPass });
      } else {
        await setNewPassword(newPass);
      }
      // Server parol o'zgarishida tokenVersion'ni oshiradi — lokal sessiya tozalanadi.
      await useAuthStore.getState().logout();
      setDone(true);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
      setError(data?.message || getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (initialized && !token) return null;

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
          <div className="w-12 h-12 rounded-xl border border-neon-green/25 bg-neon-green/10 flex items-center justify-center mb-5">
            <KeyRound size={22} className="text-neon-green" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight mb-1">Yangi parol o&apos;rnatish</h1>
          <p className="text-sm text-gray-400 mb-6">
            {user?.mustChangePassword
              ? 'Vaqtinchalik parol bilan kirdingiz. Xavfsizlik uchun doimiy parol o\'rnatishingiz shart.'
              : 'Hisobingizda yangi parol o\'rnating.'}
          </p>

          {done ? (
            <div>
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-neon-green/10 border border-neon-green/30 text-sm text-neon-green mb-5">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <span>Parol muvaffaqiyatli o\'rnatildi. Endi yangi parol bilan tizimga kiring.</span>
              </div>
              <button
                type="button"
                onClick={() => router.replace('/login')}
                className="w-full py-3 rounded-xl neon-btn text-sm font-bold"
              >
                Kirish sahifasiga o&apos;tish
              </button>
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
                  <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    autoComplete="new-password"
                    required
                    className="glass-input w-full rounded-xl pl-10 pr-10 py-2.5 text-sm outline-none"
                    placeholder="Kamida 6 ta belgi"
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
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Parolni tasdiqlash</label>
                <div className="relative">
                  <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    autoComplete="new-password"
                    required
                    className="glass-input w-full rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none"
                    placeholder="Yangi parolni qaytaring"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !newPass || !confirmPass}
                className="w-full py-3 rounded-xl neon-btn flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />}
                Parolni saqlash
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}