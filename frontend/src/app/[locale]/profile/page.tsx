'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Mail, Phone, UserRound, Save, Loader2, KeyRound, ShieldCheck, CalendarDays, LogOut, Coins,
} from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useAuthStore } from '@/store/auth';
import api, { getApiErrorMessage } from '@/lib/api';
import SupportChat from '@/components/support/SupportChat';

export default function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  void params;
  const t = useTranslations('auth');
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [passSaving, setPassSaving] = useState(false);
  const [passMsg, setPassMsg] = useState<string | null>(null);
  const [passErr, setPassErr] = useState<string | null>(null);

  useEffect(() => {
    if (initialized && !user) router.replace('/login');
  }, [initialized, user, router]);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName || '');
      setPhone(user.phone || '');
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

  async function saveProfile() {
    setSaving(true);
    setSaveErr(null);
    setSaveMsg(null);
try {
      const { data } = await api.put('/api/auth/profile', { fullName, phone });
      setAuth({ user: { ...user!, ...(data.data || {}) }, accessToken: token!, refreshToken: '' });
      setSaveMsg('Ma\'lumotlar saqlandi');
    } catch (e) {
      setSaveErr(getApiErrorMessage(e, "Saqlashda xatolik"));
    }
    setSaving(false);
  }

  async function changePass() {
    setPassSaving(true);
    setPassErr(null);
    setPassMsg(null);
    try {
      await api.put('/api/auth/change-password', { oldPassword: oldPass, newPassword: newPass });
      setPassMsg("Parol o'zgartirildi");
      setOldPass('');
      setNewPass('');
    } catch (e) {
      setPassErr(getApiErrorMessage(e, "Parol almashishda xatolik"));
    }
    setPassSaving(false);
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
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-neon-cyan via-neon-purple to-neon-magenta grid place-items-center font-extrabold text-2xl text-white shadow-glow">
                  {(user.fullName || '?').slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-lg">{user.fullName}</p>
                  <p className="text-sm text-gray-400 flex items-center gap-1.5">
                    <Mail size={13} /> {user.email}
                  </p>
                  <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-yellow-400/10 text-yellow-300 border border-yellow-400/20">
                    <ShieldCheck size={11} /> {roleLabel}
                  </span>
                </div>
              </div>
              <div className="text-right text-xs text-gray-500">
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
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <Save size={16} className="text-neon-cyan" /> Ma&apos;lumotlarni tahrirlash
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1">
                  <UserRound size={12} /> To&apos;liq ism
                </label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  placeholder="Ism Familiya"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1">
                  <Phone size={12} /> Telefon
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  placeholder="+998 90 123 45 67"
                />
              </div>
              {saveMsg && <p className="text-sm text-neon-green">{saveMsg}</p>}
              {saveErr && <p className="text-sm text-red-400">{saveErr}</p>}
              <button
                onClick={saveProfile}
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl neon-btn font-bold text-sm disabled:opacity-60"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Saqlash
              </button>
            </div>
          </div>

          {/* Parol */}
          <div className="neo-card rounded-2xl p-6">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <KeyRound size={16} className="text-neon-magenta" /> Parolni o&apos;zgartirish
            </h3>
            <div className="space-y-4">
              <input
                type="password"
                value={oldPass}
                onChange={(e) => setOldPass(e.target.value)}
                placeholder="Joriy parol"
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              />
              <input
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="Yangi parol (kamida 6 belgi)"
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              />
              {passMsg && <p className="text-sm text-neon-green">{passMsg}</p>}
              {passErr && <p className="text-sm text-red-400">{passErr}</p>}
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

          <button
            onClick={() => { logout(); router.push('/'); }}
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
          <SupportChat mode="user" />
        </div>
      </div>
    </div>
  );
}