'use client';

import { useEffect, useState } from 'react';
import { Fingerprint, ScanFace, Plus, Loader2, Trash2, Pencil, ShieldCheck, Smartphone, type LucideIcon } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { toastSuccess, toastError } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import { addPasskey, supportsBiometric, detectBiometric, type BiometricInfo, type PasskeyRecord } from '@/lib/webauthn';
import { useAuthStore } from '@/store/auth';

export default function PasskeySettings() {
  const updateUser = useAuthStore((s) => s.updateUser);
  const user = useAuthStore((s) => s.user);
  const [passkeys, setPasskeys] = useState<PasskeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioInfo, setBioInfo] = useState<BiometricInfo | null>(null);
  const [requirePasskey, setRequirePasskey] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  // O'chirishdan oldin qayta autentifikatsiya (parol) uchun
  const [removeAsk, setRemoveAsk] = useState<string | null>(null);
  const [removePass, setRemovePass] = useState('');

  const BiometricIcon: LucideIcon = bioInfo?.method === 'faceid' ? ScanFace : Fingerprint;
  const bioLabel = bioInfo?.label ?? 'Passkey';

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<{ success: boolean; data: PasskeyRecord[] }>('/api/webauthn/passkeys');
      setPasskeys(data.data || []);
    } catch {
      setPasskeys([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    supportsBiometric().then(setBioAvailable).catch(() => setBioAvailable(false));
    detectBiometric().then(setBioInfo).catch(() => setBioInfo(null));
    if (user) setRequirePasskey(!!user.requirePasskey);
  }, [user?.id]);

  async function handleAdd() {
    // platformAuthenticatorIsAvailable ichonchsiz bo'lishi mumkin (masalan ba'zi brauzerlar),
    // shuning uchun har doim urinamiz — WebAuthn o'zi buni tasdiqlaydi (security key ham ishlaydi)
    setBusy(true);
    try {
      await addPasskey(deviceName.trim() || undefined);
      toastSuccess('Passkey muvaffaqiyatli qo\'shildi');
      setDeviceName('');
      await load();
    } catch (err) {
      toastError(getApiErrorMessage(err, 'Passkey qo\'shishda xatolik'));
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(id: string) {
    const name = editName.trim();
    if (!name) return;
    try {
      const { data } = await api.patch(`/api/webauthn/passkeys/${id}`, { deviceName: name });
      toastSuccess(data?.message || 'Qurilma nomi yangilandi');
      setEditing(null);
      setEditName('');
      await load();
    } catch (err) {
      toastError(getApiErrorMessage(err, 'Nomlashda xatolik'));
    }
  }

  async function handleRemove(id: string) {
    const ok = await confirmDialog({
      title: 'Passkeyni o\'chirish',
      message: 'Bu qurilma endi kirish uchun ishlatilmaydi. Tasdiqlash uchun parolingiz so\'raladi.',
      confirmLabel: 'Davom etish',
      cancelLabel: 'Bekor qilish',
      danger: true,
    });
    if (!ok) return;
    setRemovePass('');
    setRemoveAsk(id);
  }

  async function confirmRemove() {
    if (!removeAsk) return;
    if (!removePass) {
      toastError('Parolni kiriting');
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.delete(`/api/webauthn/passkeys/${removeAsk}`, { data: { password: removePass } });
      toastSuccess(data?.message || 'Passkey o\'chirildi');
      setRemoveAsk(null);
      setRemovePass('');
      await load();
    } catch (err) {
      toastError(getApiErrorMessage(err, 'O\'chirishda xatolik'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleRequire() {
    const next = !requirePasskey;
    if (next) {
      const ok = await confirmDialog({
        title: 'Passkey talabi',
        message: 'Endi parol bilan kirganda ham qo\'shimcha passkey tasdiqlash talab qilinadi. Yoqasizmi?',
        confirmLabel: 'Yoniq',
        cancelLabel: 'Bekor qilish',
      });
      if (!ok) return;
    }
    try {
      const { data } = await api.patch('/api/webauthn/settings', { requirePasskey: next });
      setRequirePasskey(data.data?.requirePasskey ?? next);
      updateUser({ requirePasskey: data.data?.requirePasskey ?? next });
      toastSuccess(data?.message || 'Sozlama yangilandi');
    } catch (err) {
      toastError(getApiErrorMessage(err, 'Sozlamani yangilashda xatolik'));
    }
  }

  return (
    <div className="neo-card rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h3 className="font-bold flex items-center gap-2">
          <BiometricIcon size={16} className="text-neon-cyan" /> Passkey va biometriya
        </h3>
        {bioAvailable ? (
          <span className="text-[10px] px-2 py-1 rounded-full bg-neon-green/10 text-neon-green border border-neon-green/25 font-bold uppercase tracking-wider">
            {bioLabel}
          </span>
        ) : (
          <span className="text-[10px] px-2 py-1 rounded-full bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/25 font-bold uppercase tracking-wider">
            Security key / boshqa qurilma
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500 leading-relaxed mb-4">
        Passkey — {bioLabel} orqali xavfsiz kirish. Private key
        hech qachon serverga yuborilmaydi, faqat qurilmangizda saqlanadi.
      </p>

      {/* Passkey talab tugmasi */}
      <button
        type="button"
        onClick={toggleRequire}
        disabled={busy || passkeys.length === 0}
        className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg mb-4 border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={
          requirePasskey
            ? { borderColor: 'var(--acc-b)', color: 'var(--acc-b)', background: 'color-mix(in srgb, var(--acc-b) 10%, transparent)' }
            : { borderColor: 'rgb(55 65 81)', color: 'rgb(156 163 175)' }
        }
      >
        <ShieldCheck size={14} />
        {requirePasskey ? 'Passkey tasdiqlash YOQILGAN' : 'Passkey tasdiqlash o\'chiq'}
      </button>

      {/* Passkeylar ro'yxati */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
          <span className="w-4 h-4 rounded-full border-2 border-neon-cyan border-t-transparent animate-spin" />
          Yuklanmoqda...
        </div>
      ) : passkeys.length > 0 ? (
        <div className="space-y-2">
          {passkeys.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-black/20 border border-white/5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-neon-cyan/10 border border-neon-cyan/25 grid place-items-center shrink-0">
                  <Smartphone size={14} className="text-neon-cyan" />
                </span>
                <div className="min-w-0">
                  {editing === p.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(p.id);
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        autoFocus
                        maxLength={60}
                        className="glass-input w-44 rounded-lg px-2 py-1 text-xs outline-none"
                      />
                      <button onClick={() => handleRename(p.id)} className="text-neon-green text-xs font-bold">
                        OK
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-semibold truncate">{p.deviceName || 'Yangi qurilma'}</p>
                      <p className="text-[10px] text-gray-500">
                        {new Date(p.createdAt).toLocaleDateString('uz-UZ')} da qo&apos;shilgan
                        {p.lastUsedAt ? ` · Oxirgi: ${new Date(p.lastUsedAt).toLocaleDateString('uz-UZ')}` : ''}
                      </p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {editing !== p.id && (
                  <button
                    aria-label="Nomlash"
                    onClick={() => {
                      setEditing(p.id);
                      setEditName(p.deviceName || '');
                    }}
                    className="p-2 rounded-lg text-gray-400 hover:text-neon-cyan transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                )}
                <button
                  aria-label="O'chirish"
                  onClick={() => handleRemove(p.id)}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-3 py-4 rounded-xl bg-black/20 border border-white/5 text-center">
          <p className="text-sm text-gray-400 mb-2">Hozircha passkey yo&apos;q.</p>
        </div>
      )}

      {removeAsk && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-xs text-red-200 mb-2">
            Xavfsizlik uchun passkeyni o&apos;chirishdan oldin joriy parolingizni kiriting.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="password"
              value={removePass}
              onChange={(e) => setRemovePass(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmRemove(); if (e.key === 'Escape') setRemoveAsk(null); }}
              placeholder="Joriy parol"
              autoComplete="current-password"
              autoFocus
              className="glass-input flex-1 rounded-xl px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={confirmRemove}
              disabled={busy || !removePass}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-red-500/40 text-red-300 text-sm font-bold hover:bg-red-500/10 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              O&apos;chirish
            </button>
            <button
              type="button"
              onClick={() => { setRemoveAsk(null); setRemovePass(''); }}
              className="px-4 py-2 rounded-xl btn-ghost text-sm"
            >
              Bekor
            </button>
          </div>
        </div>
      )}

      {/* Qo'shish */}
      <div className="flex flex-col sm:flex-row gap-2 mt-4">
        <input
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder="Qurilma nomi (ixtiyoriy) — masalan 'iPhone 15'"
          maxLength={60}
          className="glass-input flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl neon-btn font-bold text-sm disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Passkey qo&apos;shish
        </button>
      </div>
    </div>
  );
}