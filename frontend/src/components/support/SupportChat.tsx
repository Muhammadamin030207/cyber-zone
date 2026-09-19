'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Send, Loader2, ShieldCheck, Phone, Mail, Trash2, UserRound,
} from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

interface SupportMsg {
  id: string;
  userId: string;
  senderId: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
  user?: { id: string; fullName: string; email: string; phone: string | null; role: string };
  sender?: { id: string; fullName: string; role: string; avatarUrl?: string | null } | null;
}

interface SupportThread {
  user: { id: string; fullName: string; email: string; phone: string | null; role: string };
  unread: number;
  total: number;
  lastMessage?: SupportMsg;
}

/**
 * Support chat — foydalanuvchi ↔ super_admin.
 * - USER/ADMIN rejimi: o'z murojaatini yozadi va javoblarini jonli ko'radi
 * - SUPER_ADMIN rejimi: barcha murojaatlar ro'yxati + javob yozish
 */
export default function SupportChat({ mode = 'user' }: { mode?: 'user' | 'admin' }) {
  const me = useAuthStore((s) => s.user);
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMsg[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const isAdminMode = mode === 'admin' && ['SUPER_ADMIN', 'ADMIN'].includes(me?.role || '');

  const merge = (list: SupportMsg[], incoming: SupportMsg | SupportMsg[]) =>
    Array.from(new Map([...list, ...(Array.isArray(incoming) ? incoming : [incoming])].map((m) => [m.id, m])).values())
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const loadThreads = useCallback(async () => {
    try {
      const { data } = await api.get('/api/support/threads');
      setThreads(data.data || []);
    } catch { /* skip */ }
  }, []);

  const openThread = useCallback(async (userId: string) => {
    setActiveUserId(userId);
    setMessages([]);
    try {
      const { data } = await api.get(`/api/support/messages?userId=${userId}`);
      setMessages(data.data.messages || []);
      if (isAdminMode) loadThreads();
    } catch { /* skip */ }
  }, [isAdminMode, loadThreads]);

  // Dastlabki yuklash
  useEffect(() => {
    if (!me) return;
    if (isAdminMode) {
      loadThreads().finally(() => setLoading(false));
    } else {
      api
        .get('/api/support/messages')
        .then(({ data }) => {
          setMessages(data.data.messages || []);
          setActiveUserId(data.data.userId || me.id);
        })
        .catch(() => { /* skip */ })
        .finally(() => setLoading(false));
    }
  }, [me, isAdminMode, loadThreads]);

  // Jonli yangilanish (socket + polling)
  useEffect(() => {
    if (!me) return;
    const socket = getSocket();
    socket.emit('register', me.id);
    if (isAdminMode) socket.emit('joinSupport');

    const onNew = (payload: { userId: string; message: SupportMsg }) => {
      if (!isAdminMode) {
        setMessages((m) => merge(m, payload.message));
      } else {
        if (activeUserId === payload.userId) {
          setMessages((m) => merge(m, payload.message));
        }
        loadThreads();
      }
    };
    socket.on('support:new', onNew);
    socket.on('support:thread:new', onNew);
    return () => {
      socket.off('support:new', onNew);
      socket.off('support:thread:new', onNew);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, isAdminMode, activeUserId]);

  // Polling — refresh'siz ham kelishi uchun
  useEffect(() => {
    if (!me) return;
    const timer = window.setInterval(async () => {
      try {
        if (isAdminMode) {
          loadThreads();
          if (activeUserId) {
            const { data } = await api.get(`/api/support/messages?userId=${activeUserId}`);
            setMessages((m) => merge(m, data.data.messages || []));
          }
        } else {
          const { data } = await api.get('/api/support/messages');
          setMessages((m) => merge(m, data.data.messages || []));
        }
      } catch { /* skip */ }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [me, isAdminMode, activeUserId, loadThreads]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [messages.length, activeUserId]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    setErr(null);
    try {
      let userId: string | undefined;
      if (isAdminMode) userId = activeUserId || undefined;
      const { data } = await api.post('/api/support/messages', { message: text, userId });
      if (isAdminMode && activeUserId) {
        setMessages((m) => merge(m, data.data));
        loadThreads();
      } else {
        setMessages((m) => merge(m, data.data));
      }
      setText('');
    } catch (e) {
      setErr(getApiErrorMessage(e));
    }
    setSending(false);
  }

  async function clearThread() {
    if (!activeUserId || !confirm('Bu murojaatni tozalash?')) return;
    try {
      await api.delete(`/api/support/threads/${activeUserId}`);
      setMessages([]);
      loadThreads();
    } catch { /* skip */ }
  }

  if (!me) return null;

  return (
    <div className="neo-card rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-neon-cyan/15 bg-gradient-to-r from-yellow-400/10 via-transparent to-neon-cyan/10 flex items-center justify-between">
        <h3 className="font-bold flex items-center gap-2">
          <ShieldCheck size={18} className="text-yellow-400" />
          {isAdminMode ? 'Murojaatlar' : 'Super Admin bilan bog\'lanish'}
        </h3>
        <span className="text-[10px] px-2 py-1 rounded-full bg-yellow-400/10 text-yellow-300 font-bold uppercase tracking-wider">
          Support
        </span>
      </div>

      {isAdminMode ? (
        <div className="grid lg:grid-cols-3 gap-4 p-5">
          {/* Threads */}
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto scrollbar-thin lg:border-r lg:border-white/10 lg:pr-3">
            {loading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-cyber-800 animate-pulse" />)}</div>
            ) : threads.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">Hozircha murojaatlar yo&apos;q</p>
            ) : (
              threads.map((t) => (
                <button
                  key={t.user.id}
                  onClick={() => openThread(t.user.id)}
                  className={cn(
                    'w-full text-left rounded-xl border px-3 py-2.5 transition-colors',
                    activeUserId === t.user.id ? 'border-yellow-400/40 bg-yellow-400/10' : 'border-white/10 bg-cyber-900 hover:border-yellow-400/25'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate flex items-center gap-1.5">
                      <UserRound size={12} className="text-yellow-400 shrink-0" /> {t.user.fullName}
                    </span>
                    {t.unread > 0 && (
                      <span className="w-5 h-5 rounded-full bg-yellow-400 text-black text-[10px] font-extrabold grid place-items-center shrink-0">{t.unread}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">{t.lastMessage?.message || 'Xabar yo\'q'}</p>
                </button>
              ))
            )}
          </div>

          {/* Thread view */}
          <div className="lg:col-span-2">
            {!activeUserId ? (
              <div className="h-64 grid place-items-center text-sm text-gray-500">Suhbatni tanlang</div>
            ) : (
              <div className="flex flex-col h-[400px]">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div>
                    <b>{threads.find((t) => t.user.id === activeUserId)?.user.fullName || 'Foydalanuvchi'}</b>
                    <div className="text-xs text-gray-500 flex items-center gap-3 mt-0.5">
                      {threads.find((t) => t.user.id === activeUserId)?.user.phone && (
                        <span className="flex items-center gap-1"><Phone size={10} /> {threads.find((t) => t.user.id === activeUserId)?.user.phone}</span>
                      )}
                      <span className="flex items-center gap-1 truncate"><Mail size={10} /> {threads.find((t) => t.user.id === activeUserId)?.user.email}</span>
                    </div>
                  </div>
                  <button onClick={clearThread} title="Murojaatni tozalash" className="p-2 rounded-lg text-red-400 hover:bg-red-500/10"><Trash2 size={14} /></button>
                </div>
                <MessageList messages={messages} meId={me.id} boxRef={boxRef} />
                <InputBar value={text} onChange={setText} onSend={send} sending={sending} placeholder="Javob yozing..." />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="max-h-[360px] min-h-[200px]">
            <MessageList messages={messages} meId={me.id} boxRef={boxRef} loading={loading} empty="Muammo/savol bo'lsa super admin'ga yozing. Odatda qisqa vaqt ichida javob beramiz." />
          </div>
          {err && <p className="px-5 text-xs text-red-400">{err}</p>}
          <div className="border-t border-white/10 p-3">
            <InputBar value={text} onChange={setText} onSend={send} sending={sending} placeholder="Super admin'ga xabar yozing..." />
          </div>
        </div>
      )}
    </div>
  );
}

function MessageList({ messages, meId, boxRef, loading, empty }: {
  messages: SupportMsg[];
  meId: string;
  boxRef: React.RefObject<HTMLDivElement | null>;
  loading?: boolean;
  empty?: string;
}) {
  if (loading) {
    return (
      <div className="p-5 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg bg-cyber-800 animate-pulse w-3/5" />)}</div>
    );
  }
  if (messages.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-12 px-5">{empty || 'Xabar yo\'q'}</p>;
  }
  return (
    <div ref={boxRef} className="h-[360px] overflow-y-auto scrollbar-thin p-5 space-y-2.5">
      {messages.map((m) => {
        const mine = m.senderId === meId;
        const isSupport = m.senderId !== m.userId;
        return (
          <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', mine ? 'bg-yellow-400/15 border border-yellow-400/25 text-gray-100' : 'bg-cyber-800 border border-white/10 text-gray-200')}>
              <div className={cn('flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide mb-0.5', mine ? 'text-yellow-400' : 'text-gray-500')}>
                {!mine && isSupport && <ShieldCheck size={10} className="text-yellow-400" />}
                {isSupport ? 'Super Admin' : (m.user?.fullName || 'Siz')}
              </div>
              <p className="whitespace-pre-wrap break-words">{m.message}</p>
              <p className="text-[9px] text-gray-600 mt-1 text-right">
                {new Date(m.createdAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InputBar({ value, onChange, onSend, sending, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  placeholder: string;
}) {
  return (
    <div className="flex items-end gap-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
        placeholder={placeholder}
        rows={1}
        className="glass-input flex-1 rounded-xl px-3 py-2 text-sm outline-none resize-none max-h-24"
      />
      <button
        onClick={onSend}
        disabled={sending || !value.trim()}
        className="w-10 h-10 rounded-xl neon-btn grid place-items-center shrink-0 disabled:opacity-40"
      >
        {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
      </button>
    </div>
  );
}