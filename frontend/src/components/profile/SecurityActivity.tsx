'use client';

import { useEffect, useState } from 'react';
import { History, Loader2, LogIn, LogOut, AlertTriangle, KeyRound, ShieldCheck, ShieldOff, Fingerprint, Lock, RefreshCw } from 'lucide-react';
import api from '@/lib/api';

interface SecurityEventRecord {
  id: string;
  type: string;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

const EVENT_META: Record<string, { label: string; icon: typeof LogIn; color: string }> = {
  LOGIN_SUCCESS: { label: 'Muvaffaqiyatli kirish', icon: LogIn, color: 'text-neon-green' },
  LOGIN_FAILED: { label: 'Xato parol urinishi', icon: AlertTriangle, color: 'text-amber-300' },
  LOGIN_LOCKED: { label: 'Hisob bloklandi', icon: Lock, color: 'text-red-400' },
  PASSWORD_CHANGED: { label: 'Parol o\'zgartirildi', icon: KeyRound, color: 'text-neon-cyan' },
  PASSWORD_RESET: { label: 'Parol tiklandi', icon: KeyRound, color: 'text-neon-cyan' },
  PASSWORD_RESET_REQUESTED: { label: 'Parol tiklash so\'rovi', icon: RefreshCw, color: 'text-amber-300' },
  TWO_FACTOR_ENABLED: { label: '2FA yoqildi', icon: ShieldCheck, color: 'text-neon-green' },
  TWO_FACTOR_DISABLED: { label: '2FA o\'chirildi', icon: ShieldOff, color: 'text-red-400' },
  TWO_FACTOR_RECOVERY_USED: { label: 'Tiklash kodi ishlatildi', icon: ShieldOff, color: 'text-amber-300' },
  PASSKEY_ADDED: { label: 'Passkey qo\'shildi', icon: Fingerprint, color: 'text-neon-cyan' },
  PASSKEY_REMOVED: { label: 'Passkey o\'chirildi', icon: Fingerprint, color: 'text-red-400' },
  LOGOUT: { label: 'Tizimdan chiqish', icon: LogOut, color: 'text-gray-400' },
};

function describeDevice(ua?: string | null): string {
  if (!ua) return 'Noma\'lum qurilma';
  const s = ua.toLowerCase();
  const os = /iphone|ipad|ipod/.test(s)
    ? 'iOS'
    : /android/.test(s)
      ? 'Android'
      : /windows/.test(s)
        ? 'Windows'
        : /mac os|macintosh/.test(s)
          ? 'macOS'
          : /linux/.test(s)
            ? 'Linux'
            : 'Noma\'lum OS';
  const browser = /edg\//.test(s)
    ? 'Edge'
    : /chrome\//.test(s) && !/chromium/.test(s)
      ? 'Chrome'
      : /firefox\//.test(s)
        ? 'Firefox'
        : /safari\//.test(s) && !/chrome/.test(s)
          ? 'Safari'
          : 'Brauzer';
  return `${browser} · ${os}`;
}

export default function SecurityActivity() {
  const [events, setEvents] = useState<SecurityEventRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get<{ success: boolean; data: SecurityEventRecord[] }>('/api/auth/security/events')
      .then(({ data }) => setEvents(data.data || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api
      .get<{ success: boolean; data: SecurityEventRecord[] }>('/api/auth/security/events')
      .then(({ data }) => setEvents(data.data || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="neo-card rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h3 className="font-bold flex items-center gap-2">
          <History size={16} className="text-neon-cyan" /> So&apos;nggi xavfsizlik voqealari
        </h3>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs text-neon-cyan hover:underline disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Yangilash
        </button>
      </div>

      {loading ? (
        <div className="py-6 grid place-items-center">
          <Loader2 size={22} className="animate-spin text-neon-cyan" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-500 py-6">
          Hozircha xavfsizlik voqealari yo&apos;q. Login, parol va 2FA o&apos;zgarishlari shu yerda qayd etiladi.
        </p>
      ) : (
        <ul className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {events.map((e) => {
            const meta = EVENT_META[e.type] || { label: e.type, icon: AlertTriangle, color: 'text-gray-400' };
            const Icon = meta.icon;
            return (
              <li key={e.id} className="flex items-start gap-3 py-1.5 border-b border-white/5 last:border-0">
                <span className={`shrink-0 w-8 h-8 rounded-lg bg-cyber-800/60 border border-cyber-700 grid place-items-center mt-0.5 ${meta.color}`}>
                  <Icon size={15} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-200">{meta.label}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {new Date(e.createdAt).toLocaleString('uz-UZ')} · {e.ip || "noma'lum IP"} · {describeDevice(e.userAgent)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}