'use client';

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  ShieldCheck, ShieldOff, Loader2, Copy, Check, KeyRound, RefreshCw, AlertCircle, Smartphone,
} from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { toastSuccess, toastError } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import { useAuthStore } from '@/store/auth';

interface Status {
  enabled: boolean;
  confirmedAt?: string | null;
  backupCodesRemaining: number;
}

export default function TwoFactorSettings() {
  const updateUser = useAuthStore((s) => s.updateUser);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  // Setup oqimi
  const [setupData, setSetupData] = useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/auth/2fa/status');
      setStatus(data.data as Status);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api
      .get<{ success: boolean; data: Status }>('/api/auth/2fa/status')
      .then(({ data }) => setStatus(data.data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!setupData?.otpauthUrl) return;
    let active = true;
    QRCode.toDataURL(setupData.otpauthUrl, {
      margin: 1,
      width: 220,
      color: { dark: '#0a0a0c', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [setupData]);

  async function startSetup() {
    setBusy(true);
    setBackupCodes(null);
    try {
      const { data } = await api.post('/api/auth/2fa/setup');
      setSetupData({ otpauthUrl: data.data.otpauthUrl, secret: data.data.secret });
      setCode('');
    } catch (e) {
      toastError(getApiErrorMessage(e, '2FA sozlashda xatolik'));
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    if (code.replace(/\D/g, '').length !== 6) {
      toastError('6 xonali kodni kiriting');
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/api/auth/2fa/enable', { code: code.trim() });
      setBackupCodes(data.data.backupCodes || []);
      setSetupData(null);
      setCode('');
      updateUser({ twoFactorEnabled: true });
      toastSuccess('Ikki faktorli himoya yoqildi');
      await load();
    } catch (e) {
      toastError(getApiErrorMessage(e, "Kod noto'g'ri yoki muddati o'tgan"));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    const ok = await confirmDialog({
      title: "2FA o'chirish",
      message: "Ikki faktorli himoyani o'chirmoqchimisiz? Bu hisob xavfsizligini pasaytiradi.",
      confirmLabel: "O'chirish",
      cancelLabel: 'Bekor qilish',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { data } = await api.post('/api/auth/2fa/disable', { code: code.trim() });
      if (data?.success) {
        setStatus({ enabled: false, backupCodesRemaining: 0 });
        setCode('');
        updateUser({ twoFactorEnabled: false });
        toastSuccess("2FA o'chirildi");
      } else {
        toastError(data?.message || "Kod noto'g'ri");
      }
    } catch (e) {
      toastError(getApiErrorMessage(e, "Kod noto'g'ri"));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      const { data } = await api.post('/api/auth/2fa/backup-codes', { code: code.trim() });
      setBackupCodes(data.data.backupCodes || []);
      setCode('');
      setStatus((s) => (s ? { ...s, backupCodesRemaining: (data.data.backupCodes || []).length } : s));
      toastSuccess('Yangi tiklash kodlari yaratildi');
    } catch (e) {
      toastError(getApiErrorMessage(e, "Kod noto'g'ri"));
    } finally {
      setBusy(false);
    }
  }

  function copy(text: string, which: 'secret' | 'codes') {
    navigator.clipboard?.writeText(text).then(() => {
      if (which === 'secret') {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      } else {
        setCopiedCodes(true);
        setTimeout(() => setCopiedCodes(false), 2000);
      }
    });
  }

  return (
    <div className="neo-card rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 className="font-bold flex items-center gap-2">
          {status?.enabled ? (
            <ShieldCheck size={16} className="text-neon-green" />
          ) : (
            <ShieldOff size={16} className="text-gray-400" />
          )}
          Ikki faktorli himoya (2FA)
        </h3>
        {loading ? null : status?.enabled ? (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-neon-green/10 text-neon-green border border-neon-green/25">
            Yoqilgan
          </span>
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-gray-500/10 text-gray-400 border border-white/10">
            O&apos;chirilgan
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500 leading-relaxed mb-4">
        Google Authenticator, Authy yoki Microsoft Authenticator kabi ilova bilan qo&apos;shimcha himoya.
        Kod 30 sekundda yangilanadi va har safar kirishda talab qilinadi.
      </p>

      {backupCodes && (
        <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
          <p className="text-sm font-semibold text-amber-200 flex items-center gap-2">
            <KeyRound size={14} /> Bir martalik tiklash kodlari
          </p>
          <p className="text-[11px] text-amber-200/70 mt-1 mb-3">
            Ushbu kodlarni xavfsiz joyda saqlang. Telefoningiz yo&apos;qolganda kirish uchun ishlatiladi.
            Har bir kod faqat bir marta ishlaydi.
          </p>
          <div className="grid grid-cols-2 gap-1.5 font-mono text-xs text-gray-200">
            {backupCodes.map((c) => (
              <span key={c} className="px-2 py-1 rounded bg-black/30 text-center tracking-wider">{c}</span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => copy(backupCodes.join('\n'), 'codes')}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-200 hover:text-amber-100"
          >
            {copiedCodes ? <Check size={13} /> : <Copy size={13} />}
            {copiedCodes ? 'Nusxalandi' : 'Barchasini nusxalash'}
          </button>
        </div>
      )}

      {status?.enabled ? (
        <div className="space-y-3">
          {status.backupCodesRemaining === 0 && (
            <p className="flex items-center gap-1.5 text-xs text-amber-300">
              <AlertCircle size={13} /> Tiklash kodlari qolmadi. Yangi kodlar yaratib oling.
            </p>
          )}
          <div>
            <label htmlFor="2fa-code" className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5">
              Autentifikator yoki tiklash kodi
            </label>
            <input
              id="2fa-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 11))}
              placeholder="123456 yoki XXXXX-XXXXX"
              className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none font-mono"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={regenerate}
              disabled={busy || !code}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neon-cyan/30 text-neon-cyan text-sm font-semibold hover:bg-neon-cyan/10 disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              Yangi tiklash kodlari
            </button>
            <button
              type="button"
              onClick={disable}
              disabled={busy || !code}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/10 disabled:opacity-50"
            >
              <ShieldOff size={15} /> 2FA o&apos;chirish
            </button>
          </div>
        </div>
      ) : setupData ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-neon-cyan/20 bg-cyber-800/40 p-4 text-center">
            <p className="text-xs text-gray-400 mb-3 flex items-center justify-center gap-1.5">
              <Smartphone size={13} /> Ilova bilan QR kodni skanerlang
            </p>
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="2FA QR kod" width={200} height={200} className="mx-auto rounded-lg" />
            ) : (
              <div className="h-[200px] grid place-items-center">
                <Loader2 size={20} className="animate-spin text-neon-cyan" />
              </div>
            )}
            <button
              type="button"
              onClick={() => copy(setupData.secret, 'secret')}
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-neon-cyan"
            >
              {copiedSecret ? <Check size={12} /> : <Copy size={12} />}
              Qo&apos;lda kiritish kaliti: <span className="font-mono">{setupData.secret}</span>
            </button>
          </div>
          <div>
            <label htmlFor="2fa-enable-code" className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5">
              Ilovadagi 6 xonali kod
            </label>
            <input
              id="2fa-enable-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="000000"
              className="glass-input w-full rounded-xl px-3 py-2.5 text-center text-lg font-mono tracking-[0.3em] outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={enable}
              disabled={busy || code.length < 6}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl neon-btn text-sm font-bold disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
              Yoqish
            </button>
            <button
              type="button"
              onClick={() => { setSetupData(null); setCode(''); }}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl btn-ghost text-sm"
            >
              Bekor qilish
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={startSetup}
          disabled={busy}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-neon-cyan/30 text-neon-cyan text-sm font-bold hover:bg-neon-cyan/10 disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
          2FA yoqish
        </button>
      )}
    </div>
  );
}
