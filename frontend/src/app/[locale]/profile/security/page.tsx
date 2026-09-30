'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ShieldCheck, KeyRound, Loader2, ArrowLeft } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { toastSuccess, toastError } from '@/lib/toast';
import { useAuthStore } from '@/store/auth';
import PasskeySettings from '@/components/profile/PasskeySettings';
import TwoFactorSettings from '@/components/profile/TwoFactorSettings';
import SecurityActivity from '@/components/profile/SecurityActivity';

export default function ProfileSecurityPage() {
  const t = useTranslations('security');
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? null;

  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const oldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    oldRef.current?.focus();
  }, [userId]);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (newPass !== confirm) {
      setFormError(t('mismatch'));
      return;
    }
    if (newPass.length < 8) {
      setFormError(t('tooShort'));
      return;
    }
    setSaving(true);
    try {
      await api.put('/api/auth/change-password', { oldPassword: oldPass, newPassword: newPass });
      toastSuccess(t('changed'));
      setOldPass('');
      setNewPass('');
      setConfirm('');
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, t('failed'));
      setFormError(msg);
      toastError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-2 text-sm text-gray-400">{t('authRequired')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Link
        href={`/${t('locale')}/profile`}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-200"
      >
        <ArrowLeft size={13} aria-hidden />
        {t('back')}
      </Link>

      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <ShieldCheck className="text-neon-green" size={24} aria-hidden />
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-gray-400">{t('subtitle')}</p>
      </header>

      <div className="space-y-5">
        {/* ======== Parol ======== */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-200">
            <KeyRound size={15} className="text-neon-cyan" aria-hidden />
            {t('password')}
          </h2>
          <form onSubmit={changePassword} className="space-y-3">
            <label className="block text-xs font-medium text-gray-400">
              <span className="mb-1.5 block">{t('currentPassword')}</span>
              <input
                ref={oldRef}
                type="password"
                value={oldPass}
                onChange={(e) => setOldPass(e.target.value)}
                autoComplete="current-password"
                required
                className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3.5 text-sm text-gray-100 outline-none focus:border-neon-cyan/50"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-gray-400">
                <span className="mb-1.5 block">{t('newPassword')}</span>
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3.5 text-sm text-gray-100 outline-none focus:border-neon-cyan/50"
                />
              </label>
              <label className="block text-xs font-medium text-gray-400">
                <span className="mb-1.5 block">{t('confirmPassword')}</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3.5 text-sm text-gray-100 outline-none focus:border-neon-cyan/50"
                />
              </label>
            </div>
            {formError && <p className="text-xs text-red-300">{formError}</p>}
            <button
              type="submit"
              disabled={saving}
              className="neon-btn inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold disabled:opacity-60"
            >
              {saving && <Loader2 size={15} className="animate-spin" aria-hidden />}
              {t('changePassword')}
            </button>
          </form>
        </section>

        {/* ======== Ikki bosqichli autentifikatsiya ======== */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <TwoFactorSettings />
        </section>

        {/* ======== Passkey (WebAuthn) ======== */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <PasskeySettings />
        </section>

        {/* ======== Xavfsizlik hodisalari ======== */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <SecurityActivity />
        </section>
      </div>
    </div>
  );
}
