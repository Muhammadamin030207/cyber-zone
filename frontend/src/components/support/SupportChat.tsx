'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Send, Loader2, ShieldCheck, Phone, Mail, Trash2, UserRound, Building2, MessageSquareText, ChevronDown,
} from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

export type SupportChannel = 'admin' | 'superadmin';
export type SupportMode = 'user' | 'admin' | 'superadmin';

interface SupportMsg {
  id: string;
  userId: string;
  senderId: string | null;
  message: string;
  recipientRole: string;
  roomId: string | null;
  isRead: boolean;
  createdAt: string;
  user?: { id: string; fullName: string; email: string; phone: string | null; role: string };
  sender?: { id: string; fullName: string; role: string; avatarUrl?: string | null } | null;
}

interface SupportThread {
  user: { id: string; fullName: string; email: string; phone: string | null; role: string };
  room?: { id: string; name: string } | null;
  unread: number;
  total: number;
  lastMessage?: SupportMsg;
}

interface SupportRoom {
  id: string;
  name: string;
  address?: string;
  owner?: { id: string; fullName: string | null };
}

const CHANNEL_UPPER = (c: SupportChannel) => (c === 'admin' ? 'ADMIN' : 'SUPER_ADMIN');

/**
 * Support chat — kanallar (ADMIN / SUPER_ADMIN) bo'yicha ajratilgan murojaatlar.
 *
 * mode='user':
 *   channel='superadmin' → foydalanuvchi super_admin bilan yozishadi
 *   channel='admin'      → foydalanuvchi xona admini bilan (room tanlanadi)
 * mode='admin':
 *   channel='superadmin' → admin o'z murojaatini super_admin'ga yozadi
 *   channel='admin'      → admin inbox: userlar murojaatlari (ism+tel ko'rinadi)
 * mode='superadmin':
 *   channel='superadmin' → super admin inbox (scope=users|admins|all)
 *   channel='admin'      → super admin: xonalarga tushgan murojaatlar kuzatuvi
 */
export default function SupportChat({
  mode = 'user',
  channel = 'superadmin',
  scope = 'all',
}: {
  mode?: SupportMode;
  channel?: SupportChannel;
  scope?: 'all' | 'users' | 'admins';
}) {
  const me = useAuthStore((s) => s.user);
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [supportRooms, setSupportRooms] = useState<SupportRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<SupportRoom | null>(null);
  const [active, setActive] = useState<{ userId: string; roomId?: string | null } | null>(null);
  const [messages, setMessages] = useState<SupportMsg[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const chUpper = CHANNEL_UPPER(channel);

  const isListMode = mode === 'superadmin' || (mode === 'admin' && channel === 'admin');
  const isSuperAdmin = me?.role === 'SUPER_ADMIN';
  const visitorName = activeRoom?.owner?.fullName || (isSuperAdmin ? 'Super Admin' : 'Xona admini');

  const visibleThreads = threads.filter((t) =>
    scope === 'all' ? true : scope === 'users' ? t.user.role === 'USER' : t.user.role !== 'USER'
  );

  const merge = (list: SupportMsg[], incoming: SupportMsg | SupportMsg[]) =>
    Array.from(new Map([...list, ...(Array.isArray(incoming) ? incoming : [incoming])].map((m) => [m.id, m])).values())
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const loadThreads = useCallback(async () => {
    const params = new URLSearchParams({ channel: chUpper });
    try {
      const { data } = await api.get(`/api/support/threads?${params}`);
      setThreads(data.data || []);
    } catch { /* skip */ }
  }, [chUpper]);

  const loadSupportRooms = useCallback(async () => {
    try {
      const { data } = await api.get('/api/support/my-rooms');
      setSupportRooms(data.data || []);
    } catch { /* skip */ }
  }, []);

  const readSingle = useCallback(async () => {
    if (mode === 'user' && channel === 'admin') {
      if (!activeRoom) return;
      const p = new URLSearchParams({ recipient: 'ADMIN', roomId: activeRoom.id });
      const { data } = await api.get(`/api/support/messages?${p}`);
      setMessages(data.data.messages || []);
    } else {
      const { data } = await api.get('/api/support/messages');
      setMessages(data.data.messages || []);
      setActive({ userId: data.data.userId || me?.id || '' });
    }
  }, [mode, channel, activeRoom, me]);

  const loadThreadMessages = useCallback(async (uId: string, rId?: string | null) => {
    const p = new URLSearchParams({ recipient: chUpper });
    if (uId) p.set('userId', uId);
    if (chUpper === 'ADMIN' && rId) p.set('roomId', rId);
    const { data } = await api.get(`/api/support/messages?${p}`);
    setMessages(data.data.messages || []);
  }, [chUpper]);

  const openThread = useCallback(async (userId: string, roomId?: string | null) => {
    setActive({ userId, roomId });
    setMessages([]);
    try {
      await loadThreadMessages(userId, roomId);
      loadThreads();
    } catch { /* skip */ }
  }, [loadThreadMessages, loadThreads]);

  const openRoom = useCallback(async (room: SupportRoom) => {
    setActiveRoom(room);
    setActive(null);
    setMessages([]);
    const p = new URLSearchParams({ recipient: 'ADMIN', roomId: room.id });
    try {
      const { data } = await api.get(`/api/support/messages?${p}`);
      setMessages(data.data.messages || []);
      setActive({ userId: data.data.userId || me?.id || '', roomId: room.id });
    } catch { /* skip */ }
  }, [me]);

  // Dastlabki yuklash
  useEffect(() => {
    if (!me) return;
    if (isListMode) {
      loadThreads().finally(() => setLoading(false));
    } else if (mode === 'user' && channel === 'admin') {
      loadSupportRooms().finally(() => setLoading(false));
    } else {
      readSingle().finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, isListMode, mode, channel]);

  // Jonli yangilanish (socket)
  useEffect(() => {
    if (!me) return;
    const socket = getSocket();
    socket.emit('register', me.id);
    if (isSuperAdmin) socket.emit('joinSupport');
    const threadUserId = active?.userId;
    if (threadUserId) socket.emit('joinSupportThread', threadUserId, chUpper);

    const onNew = (payload: { userId: string; message: SupportMsg }) => {
      if (isListMode) {
        if (active?.userId === payload.userId) setMessages((m) => merge(m, payload.message));
        loadThreads();
      } else if (mode === 'user' && channel === 'admin') {
        if (activeRoom) {
          if (payload.message.roomId === activeRoom.id) setMessages((m) => merge(m, payload.message));
          loadSupportRooms();
        }
      } else {
        setMessages((m) => merge(m, payload.message));
      }
    };
    socket.on('support:new', onNew);
    socket.on('support:thread:new', onNew);
    return () => {
      socket.off('support:new', onNew);
      socket.off('support:thread:new', onNew);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, isListMode, mode, channel, active, activeRoom, loadThreads, loadSupportRooms]);

  // Polling fallback
  useEffect(() => {
    if (!me) return;
    const timer = window.setInterval(async () => {
      try {
        if (isListMode) {
          loadThreads();
          if (active) {
            const { data } = await api.get(`/api/support/messages?${new URLSearchParams({ recipient: chUpper, ...(active.userId ? { userId: active.userId } : {}), ...(chUpper === 'ADMIN' && active.roomId ? { roomId: active.roomId } : {}) })}`);
            setMessages((m) => merge(m, data.data.messages || []));
          }
        } else if (mode === 'user' && channel === 'admin') {
          if (activeRoom) {
            const { data } = await api.get(`/api/support/messages?${new URLSearchParams({ recipient: 'ADMIN', roomId: activeRoom.id })}`);
            setMessages((m) => merge(m, data.data.messages || []));
          }
        } else {
          const { data } = await api.get('/api/support/messages');
          setMessages((m) => merge(m, data.data.messages || []));
        }
      } catch { /* skip */ }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [me, isListMode, mode, channel, active, activeRoom, loadThreads, chUpper]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [messages.length, active, activeRoom]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    setErr(null);
    try {
      const payload: Record<string, string | undefined> = { message: text.trim(), recipient: chUpper };
      if (isListMode && active?.userId) payload.userId = active.userId;
      if (channel === 'admin') {
        if (mode === 'user' && activeRoom) payload.roomId = activeRoom.id;
        else if (active?.roomId) payload.roomId = active.roomId;
      }
      const { data } = await api.post('/api/support/messages', payload);
      setMessages((m) => merge(m, data.data));
      if (isListMode) loadThreads();
      if (mode === 'user' && channel === 'admin') loadSupportRooms();
      setText('');
    } catch (e) {
      setErr(getApiErrorMessage(e));
    }
    setSending(false);
  }

  async function clearThread() {
    if (!active?.userId || !window.confirm('Bu murojaatni tozalash?')) return;
    try {
      const p = new URLSearchParams({ channel: chUpper });
      if (chUpper === 'ADMIN' && active.roomId) p.set('roomId', active.roomId);
      await api.delete(`/api/support/threads/${active.userId}?${p}`);
      setMessages([]);
      loadThreads();
    } catch { /* skip */ }
  }

  if (!me) return null;

  const heading =
    isSuperAdmin
      ? channel === 'admin' ? 'Xona murojaatlari' : 'Murojaatlar'
      : mode === 'admin'
        ? channel === 'admin' ? 'Mening murojaatlar' : 'Super Admin bilan bog\'lanish'
        : channel === 'admin' ? 'Xona admini bilan bog\'lanish' : 'Super Admin bilan bog\'lanish';

  return (
    <div className="neo-card rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-neon-cyan/15 bg-gradient-to-r from-yellow-400/10 via-transparent to-neon-cyan/10 flex items-center justify-between">
        <h3 className="font-bold flex items-center gap-2">
          <ShieldCheck size={18} className={channel === 'admin' ? 'text-neon-cyan' : 'text-yellow-400'} />
          {heading}
        </h3>
        <span className="text-[10px] px-2 py-1 rounded-full bg-yellow-400/10 text-yellow-300 font-bold uppercase tracking-wider">
          {channel === 'admin' ? 'Admin PM' : 'Support'}
        </span>
      </div>

      {isListMode ? (
        <div className="grid lg:grid-cols-3 gap-4 p-5">
          {/* Threads */}
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto scrollbar-thin lg:border-r lg:border-white/10 lg:pr-3">
            {loading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-cyber-800 animate-pulse" />)}</div>
            ) : visibleThreads.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">Hozircha murojaatlar yo&apos;q</p>
            ) : (
              visibleThreads.map((t) => (
                <button
                  key={`${t.user.id}${t.room?.id || ''}`}
                  onClick={() => openThread(t.user.id, t.room?.id)}
                  className={cn(
                    'w-full text-left rounded-xl border px-3 py-2.5 transition-colors',
                    active?.userId === t.user.id && (active.roomId ?? null) === (t.room?.id ?? null)
                      ? 'border-yellow-400/40 bg-yellow-400/10'
                      : 'border-white/10 bg-cyber-900 hover:border-yellow-400/25'
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
                  {t.room?.name && (
                    <p className="text-[10px] text-neon-cyan flex items-center gap-1 mt-0.5 truncate">
                      <Building2 size={9} /> {t.room.name}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1 truncate">{t.lastMessage?.message || ('Xabar yo\'q')}</p>
                </button>
              ))
            )}
          </div>

          {/* Thread view */}
          <div className="lg:col-span-2">
            {!active ? (
              <div className="h-64 grid place-items-center text-sm text-gray-500">Suhbatni tanlang</div>
            ) : (
              <div className="flex flex-col h-[400px]">
                <ThreadHeader
                  name={threads.find((t) => t.user.id === active.userId && (t.room?.id ?? null) === (active.roomId ?? null))?.user.fullName || 'Foydalanuvchi'}
                  email={threads.find((t) => t.user.id === active.userId && (t.room?.id ?? null) === (active.roomId ?? null))?.user.email}
                  phone={threads.find((t) => t.user.id === active.userId && (t.room?.id ?? null) === (active.roomId ?? null))?.user.phone}
                  role={threads.find((t) => t.user.id === active.userId && (t.room?.id ?? null) === (active.roomId ?? null))?.user.role}
                  roomName={threads.find((t) => t.user.id === active.userId && (t.room?.id ?? null) === (active.roomId ?? null))?.room?.name}
                  onClear={isSuperAdmin || (me.role === 'ADMIN' && channel === 'admin') ? clearThread : undefined}
                />
                <MessageList messages={messages} meId={me.id} boxRef={boxRef} />
                {err && <p className="px-5 pb-1 text-xs text-red-400">{err}</p>}
                <InputBar value={text} onChange={setText} onSend={send} sending={sending} placeholder="Javob yozing..." />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Room picker — user -> admin kanali */}
          {mode === 'user' && channel === 'admin' && (
            <div className="px-5 pt-4">
              {loading ? (
                <div className="flex gap-2">{[1, 2, 3].map((i) => <div key={i} className="h-9 w-28 rounded-full bg-cyber-800 animate-pulse" />)}</div>
              ) : supportRooms.length === 0 ? (
                <p className="text-sm text-gray-500">Hozircha suhbat boshlash uchun xona topilmadi.</p>
              ) : (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5 font-medium">Xona tanlang</p>
                  <div className="flex flex-wrap gap-2">
                    {supportRooms.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => openRoom(r)}
                        className={cn(
                          'text-xs font-medium rounded-full border px-3 py-1.5 flex items-center gap-1.5 transition-colors',
                          activeRoom?.id === r.id ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan' : 'border-white/10 bg-cyber-900 text-gray-300 hover:border-neon-cyan/30'
                        )}
                      >
                        <Building2 size={11} className="shrink-0" /> {r.name}
                        {r.owner?.fullName && <span className="text-gray-500">· {r.owner.fullName}</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <div className={cn(mode === 'user' && channel === 'admin' && 'pt-3', 'max-h-[360px] min-h-[200px]')}>
            <MessageList
              messages={messages}
              meId={me.id}
              boxRef={boxRef}
              loading={loading}
              empty={
                mode === 'user' && channel === 'admin'
                  ? activeRoom
                    ? `Savol yoki muammo bo'lsa ${visitorName}ga yozing. Xona adminlari odatda tez javob beradi.`
                    : 'Suhbatlashish uchun xona tanlang.'
                  : "Muammo/savol bo'lsa super admin'ga yozing. Odatda qisqa vaqt ichida javob beramiz."
              }
            />
          </div>
          {err && <p className="px-5 text-xs text-red-400">{err}</p>}
          <div className="border-t border-white/10 p-3">
            <InputBar
              value={text}
              onChange={setText}
              onSend={send}
              sending={sending}
              placeholder={mode === 'user' && channel === 'admin' ? (activeRoom ? `${visitorName}ga xabar yozing...` : 'Avval xona tanlang...') : 'Xabar yozing...'}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadHeader({ name, email, phone, role, roomName, onClear }: {
  name: string;
  email?: string;
  phone?: string | null;
  role?: string;
  roomName?: string;
  onClear?: () => void;
}) {
  return (
    <div className="flex items-center justify-between pb-2 border-b border-white/10">
      <div>
        <b className="flex items-center gap-1.5 text-sm">
          {name}
          {role && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-400/10 text-yellow-300 font-bold uppercase">{role === 'USER' ? 'User' : (role === 'ADMIN' ? 'Admin' : 'Super Admin')}</span>
          )}
        </b>
        <div className="text-xs text-gray-500 flex items-center gap-3 mt-0.5 flex-wrap">
          {phone && <span className="flex items-center gap-1"><Phone size={10} /> {phone}</span>}
          {email && <span className="flex items-center gap-1 truncate"><Mail size={10} /> {email}</span>}
          {roomName && <span className="flex items-center gap-1 text-neon-cyan"><Building2 size={10} /> {roomName}</span>}
        </div>
      </div>
      {onClear && (
        <button onClick={onClear} title="Murojaatni tozalash" className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 shrink-0"><Trash2 size={14} /></button>
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
    return <p className="text-sm text-gray-500 text-center py-12 px-5">{empty || ('Xabar yo\'q')}</p>;
  }
  return (
    <div ref={boxRef} className="h-[360px] overflow-y-auto scrollbar-thin p-5 space-y-2.5">
      {messages.map((m) => {
        const mine = m.senderId === meId;
        const author = m.senderId === m.userId ? m.user : m.sender;
        const isSupport = author?.role === 'SUPER_ADMIN';
        const isRoomReply = Boolean(!mine && author && author.id !== m.userId && author.role === 'ADMIN');
        return (
          <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', mine ? 'bg-yellow-400/15 border border-yellow-400/25 text-gray-100' : 'bg-cyber-800 border border-white/10 text-gray-200')}>
              <div className={cn('flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide mb-0.5', mine ? 'text-yellow-400' : 'text-gray-500')}>
                <AuthorLabel mine={mine} isSupport={isSupport} isRoomReply={isRoomReply} authorName={author?.fullName} role={author?.role} />
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

function AuthorLabel({ mine, isSupport, isRoomReply, authorName, role }: {
  mine: boolean;
  isSupport: boolean;
  isRoomReply: boolean;
  authorName?: string;
  role?: string;
}) {
  const name = isSupport ? 'Super Admin' : isRoomReply ? (authorName || 'Admin') : (authorName || 'Siz');
  return (
    <>
      {isSupport && <ShieldCheck size={10} className="text-yellow-400" />}
      {isRoomReply && <Building2 size={10} className="text-neon-cyan" />}
      {name}
      {isRoomReply && role && <span className="text-gray-600"> · {authorName || 'Admin'}</span>}
    </>
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