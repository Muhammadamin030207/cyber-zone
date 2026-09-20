'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MessageSquare, Send, Loader2, Monitor, ShieldCheck, Inbox, MessageCircleDashed, Building2,
} from 'lucide-react';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import { cn, mergeChatMessages } from '@/lib/utils';
import SupportChat from '@/components/support/SupportChat';

interface ChatRoom {
  id: string;
  name: string;
  unread: number;
  lastMessage: { message: string; createdAt: string; user: { fullName: string; role: string } } | null;
}

interface Msg {
  id: string;
  message: string;
  role: string;
  createdAt: string;
  user: { id: string; fullName: string; role: string };
}

/**
 * Foydalanuvchi chat sahifasi — xonalar bilan aloqa (bron joyidan ajratilgan).
 * O'ng yuqorida super_admin'ga murojaat qilish imkoniyati.
 */
export default function UserMessenger() {
  const me = useAuthStore((s) => s.user);

  // Super Admin — murojaatlar boshqaruv panelida, chat sahifasida "o'ziga o'zi yozish" ko'rinmaydi
  if (me?.role === 'SUPER_ADMIN') {
    return (
      <div className="neo-card rounded-2xl p-8 text-center">
        <ShieldCheck size={40} className="mx-auto text-yellow-400 mb-3" />
        <p className="font-bold mb-1">Super Admin</p>
        <p className="text-sm text-gray-400 mb-5">
          Murojaatlar (user va adminlar xabarlari) boshqaruv panelidagi chat tablarida boshqariladi.
        </p>
        <a href="/super-admin" className="text-sm font-bold text-yellow-300 hover:text-yellow-200 underline underline-offset-4">
          Murojaatlar paneliga o&apos;tish →
        </a>
      </div>
    );
  }

  // Admin — o'z murojaati (super_admin bilan) va xona murojaatlari inbox'i
  if (me?.role === 'ADMIN') {
    return (
      <div className="space-y-4">
        <AdminTabs />
        <SupportChat mode="admin" channel="superadmin" />
      </div>
    );
  }

  return <UserMessengerInner />;
}

function AdminTabs() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] px-2.5 py-1 rounded-full bg-yellow-400/10 text-yellow-300 font-bold uppercase tracking-wider flex items-center gap-1">
        <ShieldCheck size={11} /> Super Admin bilan bog&apos;lanish
      </span>
    </div>
  );
}

function UserMessengerInner() {
  const me = useAuthStore((s) => s.user);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [active, setActive] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<'rooms' | 'admin' | 'superadmin'>('rooms');
  const boxRef = useRef<HTMLDivElement>(null);

  const loadRooms = useCallback(async () => {
    try {
      const { data } = await api.get('/api/chat/user/rooms');
      setRooms(data.data || []);
    } catch { /* skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openRoom = useCallback(async (room: ChatRoom) => {
    setActive(room);
    setMessages([]);
    try {
      const { data } = await api.get(`/api/chat/rooms/${room.id}/messages`);
      setMessages(data.data || []);
      setRooms((rs) => rs.map((r) => (r.id === room.id ? { ...r, unread: 0 } : r)));
    } catch { /* skip */ }
  }, []);

  // Jonli yangilanish (socket) + polling fallback
  useEffect(() => {
    if (!me) return;
    const socket = getSocket();
    socket.emit('register', me.id);
    const handler = (payload: { roomId: string; message: Msg }) => {
      if (active && payload.roomId === active.id) {
        setMessages((m) => mergeChatMessages(m, payload.message));
        setRooms((rs) => rs.map((r) => (r.id === payload.roomId ? { ...r, unread: 0 } : r)));
      } else {
        setRooms((rs) => rs.map((r) => (r.id === payload.roomId ? { ...r, unread: r.unread + 1 } : r)));
        loadRooms();
      }
    };
    socket.on('chat:new', handler);
    socket.on('chat:room:new', handler);
    return () => {
      socket.off('chat:new', handler);
      socket.off('chat:room:new', handler);
    };
  }, [me, active, loadRooms]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const { data } = await api.get('/api/chat/user/rooms');
        setRooms(data.data || []);
        if (active) {
          const { data: m } = await api.get(`/api/chat/rooms/${active.id}/messages`);
          setMessages((prev) => mergeChatMessages(prev, m.data || []));
        }
      } catch { /* skip */ }
    }, 6000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [messages.length, active]);

  async function send() {
    if (!active || !text.trim() || sending) return;
    setSending(true);
    try {
      const { data } = await api.post(`/api/chat/rooms/${active.id}/messages`, {
        message: text.trim(),
        role: me?.role || 'USER',
      });
      setMessages((m) => mergeChatMessages(m, data.data));
      setText('');
      loadRooms();
    } catch { /* skip */ }
    setSending(false);
  }

  if (tab !== 'rooms') {
    return (
      <div className="relative">
        <Tabs tab={tab} onChange={setTab} />
        <SupportChat mode="user" channel={tab === 'admin' ? 'admin' : 'superadmin'} />
      </div>
    );
  }

  return (
    <div className="neo-card rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-neon-cyan/15 bg-gradient-to-r from-neon-cyan/10 via-transparent to-neon-magenta/10">
        <div className="flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2">
            <MessageSquare size={18} className="text-neon-cyan" /> Xabarlar
          </h2>
        </div>
        <Tabs tab={tab} onChange={setTab} className="mt-3" />
      </div>

      <div className="grid lg:grid-cols-3 gap-0">
        {/* Rooms */}
        <div className="lg:border-r border-white/10 lg:max-h-[560px] overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-cyber-800 animate-pulse" />)}</div>
          ) : rooms.length === 0 ? (
            <div className="py-16 px-6 text-center">
              <Inbox size={32} className="mx-auto text-gray-600 mb-3" />
              <p className="text-sm text-gray-500">Hozircha suhbatlar yo&apos;q.<br />Bron qilgan xonangiz bilan shu yerda yozishishingiz mumkin.</p>
            </div>
          ) : (
            <div className="space-y-1.5 p-3">
              {rooms.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openRoom(r)}
                  className={cn(
                    'w-full text-left rounded-xl border px-3 py-3 transition-colors',
                    active?.id === r.id ? 'border-neon-cyan/50 bg-neon-cyan/10' : 'border-white/10 bg-cyber-900 hover:border-neon-cyan/30'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium flex items-center gap-1.5 truncate">
                      <Monitor size={13} className="text-neon-cyan shrink-0" /> {r.name}
                    </span>
                    {r.unread > 0 && (
                      <span className="w-5 h-5 rounded-full bg-neon-magenta text-white text-[10px] font-extrabold grid place-items-center shrink-0">{r.unread}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">{r.lastMessage?.message || 'Suhbatni boshlang'}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chat window */}
        <div className="lg:col-span-2 flex flex-col min-h-[520px]">
          {!active ? (
            <div className="flex-1 grid place-items-center py-20 text-center">
              <div>
                <MessageCircleDashed size={44} className="text-gray-700 mx-auto" />
                <p className="text-sm text-gray-500 mt-3">Suhbatni tanlang yoki bron qilingan xonaga yozing</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Monitor size={16} className="text-neon-cyan" />
                  <b className="truncate">{active.name}</b>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-neon-cyan/10 text-neon-cyan font-bold uppercase">Staff</span>
                </div>
                <button
                  onClick={() => { setActive(null); setMessages([]); }}
                  className="text-xs text-gray-500 hover:text-neon-cyan"
                >
                  Yopish
                </button>
              </div>
              <div ref={boxRef} className="flex-1 lg:h-[430px] h-[320px] overflow-y-auto scrollbar-thin p-5 space-y-2.5">
                {messages.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-14">Suhbat boshlang. Administrator tez javob beradi.</p>
                ) : (
                  messages.map((m) => {
                    const mine = m.user?.id === me?.id;
                    return (
                      <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                        <div className={cn(
                          'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm',
                          mine ? 'bg-neon-cyan/15 border border-neon-cyan/25 text-gray-100' : 'bg-cyber-800 border border-white/10 text-gray-200'
                        )}>
                          <div className={cn('flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide mb-0.5', mine ? 'text-neon-cyan' : 'text-gray-500')}>
                            {mine ? 'Siz' : (m.user?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin')}
                          </div>
                          <p className="whitespace-pre-wrap break-words">{m.message}</p>
                          <p className="text-[9px] text-gray-600 mt-1 text-right">
                            {new Date(m.createdAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="border-t border-white/10 p-3 flex items-end gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Xabar yozing..."
                  rows={1}
                  className="glass-input flex-1 rounded-xl px-3 py-2 text-sm outline-none resize-none max-h-24"
                />
                <button
                  onClick={send}
                  disabled={sending || !text.trim()}
                  className="w-10 h-10 rounded-xl neon-btn grid place-items-center shrink-0 disabled:opacity-40"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Tabs({ tab, onChange, className }: {
  tab: 'rooms' | 'admin' | 'superadmin';
  onChange: (t: 'rooms' | 'admin' | 'superadmin') => void;
  className?: string;
}) {
  const opts: { key: 'rooms' | 'admin' | 'superadmin'; icon: any; label: string }[] = [
    { key: 'rooms', icon: Monitor, label: 'Xonalar' },
    { key: 'admin', icon: Building2, label: 'Admin PM' },
    { key: 'superadmin', icon: ShieldCheck, label: 'Super Admin' },
  ];
  return (
    <div className={cn('flex items-center gap-1 overflow-x-auto scrollbar-thin', className)}>
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap border',
            tab === o.key
              ? o.key === 'superadmin' ? 'border-yellow-400/40 bg-yellow-400/10 text-yellow-300' : o.key === 'admin' ? 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan' : 'border-neon-magenta/40 bg-neon-magenta/10 text-neon-magenta'
              : 'border-white/10 text-gray-400 hover:text-neon-cyan hover:border-neon-cyan/20'
          )}
        >
          <o.icon size={13} /> {o.label}
        </button>
      ))}
    </div>
  );
}