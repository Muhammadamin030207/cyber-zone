'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Mail, Phone, UserRound, Save, Loader2, KeyRound, ShieldCheck, CalendarDays, LogOut, Coins,
  Lock, Camera, X, Undo2, Languages,
} from 'lucide-react';
import { useRouter, Link } from '@/i18n/navigation';
import { useAuthStore } from '@/store/auth';
import api, { getApiErrorMessage } from '@/lib/api';
import { toastSuccess, toastError } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import SupportChat from '@/components/support/SupportChat';
import PasskeySettings from '@/components/profile/PasskeySettings';
import TwoFactorSettings from '@/components/profile/TwoFactorSettings';
import SecurityActivity from '@/components/profile/SecurityActivity';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  void params;
  const t = useTranslations('auth');
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [language, setLanguage] = useState('uz');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [passSaving, setPassSaving] = useState(false);

  useEffect(() => {
    if (initialized && !user) router.replace('/login');
  }, [initialized, user, router]);

  useEffect(() => {
    if (user) {
      const u = user;
      queueMicrotask(() => {
        setFullName(u.fullName || '');
        setPhone(u.phone || '');
        setLanguage(u.language || 'uz');
        setAvatarUrl(u.avatarUrl || null);
        setDirty(false);
        setPreview(null);
      });
    }
  }, [user]);

  if (initialized && !user) return null;
  if (!initialized || !user || !token) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="flex items-center gap-2 text-gray-500">
          <span className="w-5 h-5 rounded-full border-2 border-neon-cyan border-t-transparent animate-spin" />
          {t('loading')}
        </div>
      </div>
    );
  }

  const currentUser = user;

  async function saveProfile() {
    const name = fullName.trim();
    if (name.length < 3) {
      toastError("Ism kamida 3 ta belgidan iborat bo'lishi kerak");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put('/api/auth/profile', { fullName: name, phone: phone.trim(), language });
      updateUser({ ...(data.data || {}) });
      setDirty(false);
      toastSuccess("Ma'lumotlar saqlandi");
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Saqlashda xatolik'));
    }
    setSaving(false);
  }

  function resetProfile() {
    setFullName(currentUser.fullName || '');
    setPhone(currentUser.phone || '');
    setLanguage(currentUser.language || 'uz');
    setPreview(null);
    setAvatarUrl(currentUser.avatarUrl || null);
    if (fileRef.current) fileRef.current.value = '';
    setDirty(false);
  }

  async function uploadAvatar(file: File) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
      toastError("Faqat rasm fayl yuklash mumkin (PNG, JPG, WEBP, GIF)");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/api/auth/avatar', fd);
      const newAvatar = data.data?.avatarUrl || avatarUrl;
      updateUser({ avatarUrl: newAvatar });
      setAvatarUrl(newAvatar);
      toastSuccess('Avatar yangilandi');
    } catch (e) {
      setPreview(null);
      toastError(getApiErrorMessage(e, "Avatarni yuklashda xatolik"));
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function changePass() {
    if (newPass.length < 6) {
      toastError("Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak");
      return;
    }
    setPassSaving(true);
    try {
      await api.put('/api/auth/change-password', { oldPassword: oldPass, newPassword: newPass });
      // Backend barcha sessiyalarni bekor qiladi (tokenVersion++) — qayta login shart.
      setOldPass('');
      setNewPass('');
      toastSuccess("Parol o'zgartirildi. Xavfsizlik uchun qaytadan kiring.");
      await logout();
      router.push('/login');
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Parol almashishda xatolik'));
    }
    setPassSaving(false);
  }

  async function handleLogout() {
    const ok = await confirmDialog({
      title: 'Tizimdan chiqish',
      message: 'Hisobingizdan chiqishni tasdiqlaysizmi?',
      confirmLabel: 'Chiqish',
      cancelLabel: 'Bekor qilish',
      danger: true,
    });
    if (ok) {
      await logout();
      router.push('/');
    }
  }

  const roleLabel = user.role === 'SUPER_ADMIN' ? 'Super Admin' : user.role === 'ADMIN' ? 'Admin' : 'Foydalanuvchi';

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold mb-6 flex items-center gap-2">
        <UserRound className="text-neon-cyan" /> Profil
      </h1>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Chap: shaxsiy ma'lumotlar */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info card */}
          <div className="neo-card rounded-2xl p-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  aria-label="Avatarni o'zgartirish"
                  data-tip="Avatarni o'zgartirish"
                  className="group relative w-20 h-20 rounded-2xl overflow-hidden shrink-0 border border-neon-cyan/25 bg-gradient-to-br from-neon-cyan via-neon-purple to-neon-magenta grid place-items-center font-extrabold text-3xl text-white shadow-glow disabled:opacity-70"
                >
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="Yangi avatar" className="absolute inset-0 w-full h-full object-cover" />
                  ) : avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt={user.fullName} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    initials(user.fullName)
                  )}
                  <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploading ? <Loader2 size={18} className="animate-spin text-neon-cyan" /> : <Camera size={18} className="text-white" />}
                  </span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadAvatar(f);
                  }}
                />
                <div className="min-w-0">
                  <p className="font-bold text-lg truncate">{user.fullName}</p>
                  <p className="text-sm text-gray-400 flex items-center gap-1.5 truncate">
                    <Mail size={13} className="shrink-0" /> {user.email}
                  </p>
                  <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-yellow-400/10 text-yellow-300 border border-yellow-400/20">
                    <ShieldCheck size={11} /> {roleLabel}
                  </span>
                </div>
              </div>
              <div className="text-right text-xs text-gray-500 shrink-0">
                <p className="flex items-center justify-end gap-1.5">
                  <CalendarDays size={13} />
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString('uz-UZ') : '—'}
                </p>
                <p>Ro&apos;yxatdan o&apos;tilgan sana</p>
              </div>
            </div>
          </div>

          {/* Edit */}
          <div className="neo-card rounded-2xl p-6">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-5">
              <h3 className="font-bold flex items-center gap-2">
                <Save size={16} className="text-neon-cyan" /> Ma&apos;lumotlarni tahrirlash
              </h3>
              {dirty && (
                <span className="text-[10px] px-2 py-1 rounded-full bg-yellow-400/10 text-yellow-300 border border-yellow-400/20 font-bold">
                  O&apos;zgarishlar saqlanmagan
                </span>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <label htmlFor="profile-fullName" className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1">
                  <UserRound size={12} /> To&apos;liq ism
                </label>
                <input
                  id="profile-fullName"
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); setDirty(true); }}
                  className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  placeholder="Ism Familiya"
                />
              </div>
              <div>
                <label htmlFor="profile-phone" className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1">
                  <Phone size={12} /> Telefon
                </label>
                <input
                  id="profile-phone"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setDirty(true); }}
                  className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  placeholder="+998 90 123 45 67"
                  autoComplete="tel"
                />
              </div>
              <div>
                <label htmlFor="profile-language" className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1">
                  <Languages size={12} /> Interfeys tili
                </label>
                <select
                  id="profile-language"
                  value={language}
                  onChange={(e) => { setLanguage(e.target.value); setDirty(true); }}
                  className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                >
                  <option value="uz">O&apos;zbekcha</option>
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label htmlFor="profile-email" className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1">
                  <Mail size={12} /> Email
                </label>
                <div className="relative">
                  <input
                    id="profile-email"
                    value={user.email}
                    readOnly
                    disabled
                    aria-readonly="true"
                    className="glass-input w-full rounded-xl pl-3 pr-12 py-2.5 text-sm outline-none opacity-70 cursor-not-allowed"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                    <Lock size={14} />
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1">
                  <Lock size={11} className="text-neon-cyan shrink-0" />
                  Email manzilini o&apos;zgartirib bo&apos;lmaydi — u hisobingizning identifikatori hisoblanadi.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={saveProfile}
                  disabled={saving || !dirty}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl neon-btn font-bold text-sm disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Saqlash
                </button>
                <button
                  onClick={resetProfile}
                  disabled={saving || !dirty}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-ghost text-sm font-medium disabled:opacity-50"
                >
                  <Undo2 size={15} /> Bekor qilish
                </button>
              </div>
            </div>
          </div>

          {/* Parol */}
          <div className="neo-card rounded-2xl p-6">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <KeyRound size={16} className="text-neon-magenta" /> Parolni o&apos;zgartirish
            </h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="profile-oldPass" className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5">Joriy parol</label>
                <input
                  id="profile-oldPass"
                  type="password"
                  value={oldPass}
                  onChange={(e) => setOldPass(e.target.value)}
                  placeholder="Joriy parol"
                  autoComplete="current-password"
                  className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                />
              </div>
              <div>
                <label htmlFor="profile-newPass" className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5">Yangi parol</label>
                <input
                  id="profile-newPass"
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="Yangi parol (kamida 6 belgi)"
                  autoComplete="new-password"
                  className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                />
              </div>
              <button
                onClick={changePass}
                disabled={passSaving || !oldPass || !newPass}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border border-neon-magenta/30 text-neon-magenta font-bold text-sm hover:bg-neon-magenta/10 disabled:opacity-50"
              >
                {passSaving ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                Parolni yangilash
              </button>
            </div>
          </div>

          {/* Ikki faktorli himoya (TOTP) */}
          <TwoFactorSettings />

          {/* Passkey / biometriya */}
          <PasskeySettings />

          {/* Ikki faktorli himoya (TOTP) */}
          <TwoFactorSettings />

          {/* So'nggi xavfsizlik voqealari */}
          <SecurityActivity />

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300"
          >
            <LogOut size={16} /> Chiqish
          </button>
        </div>

        {/* O'ng: ballar + super_admin bilan bog'lanish */}
        <div className="space-y-6">
          <div className="neo-card rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-10 h-10 rounded-xl bg-yellow-400/10 border border-yellow-400/25 grid place-items-center">
                <Coins size={20} className="text-yellow-400" />
              </span>
              <div>
                <p className="font-bold leading-tight">Bonus balans</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">1 bal = 1 so&apos;m</p>
              </div>
            </div>
            <div className="text-3xl font-extrabold text-yellow-400">{user.loyaltyBalance ?? 0}</div>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              Har bir to&apos;lov uchun 1% ball beriladi. Ballarni bron qilishda chegirma sifatida
              ishlatishingiz mumkin (narxning 50% gacha).
            </p>
          </div>
          <div className="neo-card rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/25 grid place-items-center">
                <X size={20} className="text-red-400" />
              </span>
              <div>
                <p className="font-bold leading-tight">Hisob xavfsizligi</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Email immutable</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Sizning emailingiz (<span className="text-gray-300">{user.email}</span>) hisobingizga bog&apos;langan bo&apos;lib,
              uni o&apos;zgartirib bo&apos;lmaydi. Backend tomonida ham email o&apos;zgartirish
              taqiqlangan.
            </p>
          </div>
          {user.role === 'SUPER_ADMIN' ? (
            <div className="neo-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-10 h-10 rounded-xl bg-yellow-400/10 border border-yellow-400/25 grid place-items-center">
                  <ShieldCheck size={20} className="text-yellow-400" />
                </span>
                <div>
                  <p className="font-bold leading-tight">Super Admin</p>
                  <p className="text-[10px] text-gray-500">Murojaatlar panelda boshqariladi</p>
                </div>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">
                Siz platformaning super admini sifatida murojaatlarni boshqaruv panelida o&apos;qib, javob berasiz.
              </p>
              <Link
                href="/super-admin"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl neon-btn text-sm font-bold"
              >
                <ShieldCheck size={15} /> Murojaatlar paneliga o&apos;tish
              </Link>
            </div>
          ) : user.role === 'ADMIN' ? (
            <SupportChat mode="admin" channel="superadmin" />
          ) : (
            <SupportChat mode="user" />
          )}
        </div>
      </div>
    </div>
  );
}