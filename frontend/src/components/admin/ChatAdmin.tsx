'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  MessageSquare, Send, Loader2, ArrowLeft, Trash2, ShieldCheck, Monitor, CheckCheck,
} from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

interface ChatRoom {
  id: string;
  name: string;
  address: string;
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

export default function ChatAdmin() {
  const user = useAuthStore((s) => s.user);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [active, setActive] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/chat/admin/rooms');
      setRooms(data.data || []);
    } catch { /* skip */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  const openRoom = useCallback(async (room: ChatRoom) => {
    setActive(room);
    setMessages([]);
    try {
      const { data } = await api.get(`/api/chat/rooms/${room.id}/messages`);
      setMessages(data.data || []);
      loadRooms();
    } catch { /* skip */ }
  }, [loadRooms]);

  // Jonli yangilanish
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    socket.emit('register', user.id);
    const handler = (payload: { roomId: string; message: Msg }) => {
      if (active && payload.roomId === active.id) {
        setMessages((m) => (m.some((x) => x.id === payload.message.id) ? m : [...m, payload.message]));
        // o'qilgan deb belgilash
        setRooms((rs) => rs.map((r) => (r.id === payload.roomId ? { ...r, unread: 0 } : r)));
      } else {
        setRooms((rs) => rs.map((r) => (r.id === payload.roomId ? { ...r, unread: r.unread + 1 } : r)));
      }
    };
    socket.on('chat:new', handler);
    socket.on('chat:room:new', handler);
    return () => {
      socket.off('chat:new', handler);
      socket.off('chat:room:new', handler);
    };
  }, [active, user]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [messages.length]);

  async function send() {
    if (!text.trim() || !active || sending) return;
    setSending(true);
    try {
      const { data } = await api.post(`/api/chat/rooms/${active.id}/messages`, { message: text });
      setMessages((m) => [...m, data.data]);
      setText('');
    } catch { /* skip */ }
    setSending(false);
  }

  async function clearChat() {
    if (!active || !confirm('Bu suhbatni tozalash?')) return;
    try {
      await api.delete(`/api/chat/rooms/${active.id}/clear`);
      setMessages([]);
    } catch { /* skip */ }
  }

  // Desktop: ikki panel. Mobile: bir salvha (chat rozeti)
  return (
    <div className="neo-card rounded-2xl p-5">
      {active && (
        <button onClick={() => setActive(null)} className="flex items-center gap-1 text-sm text-gray-400 hover:text-neon-cyan mb-4 lg:hidden">
          <ArrowLeft size={14} /> Suhbatlar
        </button>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Suhbatlar ro'yxati */}
        <div className={cn('lg:block', active && 'hidden')}>
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <MessageSquare size={16} className="text-neon-green" /> Suhbatlar ({rooms.length})
          </h3>
          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-cyber-800 animate-pulse" />)}</div>
          ) : rooms.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">Hozircha suhbat yo'q</p>
          ) : (
            <div className="space-y-1.5 max-h-[440px] overflow-y-auto scrollbar-thin pr-1">
              {rooms.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openRoom(r)}
                  className={cn(
                    'w-full text-left rounded-xl border px-3 py-2.5 transition-colors',
                    active?.id === r.id ? 'border-neon-cyan/40 bg-neon-cyan/10' : 'border-white/10 bg-cyber-900 hover:border-neon-cyan/25'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium flex items-center gap-1.5"><Monitor size={12} className="text-neon-cyan" />{r.name}</span>
                    {r.unread > 0 && (
                      <span className="w-5 h-5 rounded-full bg-neon-green text-black text-[10px] font-extrabold grid place-items-center">{r.unread}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {r.lastMessage ? `${r.lastMessage.user.fullName}: ${r.lastMessage.message}` : 'Hali xabar yo\'q'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Suxbat oynasi */}
        <div className={cn('lg:col-span-2', !active && 'hidden lg:block')}>
          {!active ? (
            <div className="h-64 grid place-items-center text-sm text-gray-500">
              <div className="text-center">
                <MessageSquare size={32} className="mx-auto mb-2 text-gray-700" />
                Suhbatni tanlang
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-[440px]">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div>
                  <b className="flex items-center gap-1.5"><Monitor size={13} className="text-neon-cyan" />{active.name}</b>
                  <p className="text-xs text-gray-500">{active.address}</p>
                </div>
                <button onClick={clearChat} title="Suhbatni tozalash" className="p-2 rounded-lg text-red-400 hover:bg-red-500/10"><Trash2 size={14} /></button>
              </div>

              <div ref={boxRef} className="flex-1 overflow-y-auto scrollbar-thin py-3 space-y-2.5">
                {messages.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-12">Hali xabar yo'q</p>
                ) : (
                  messages.map((m) => {
                    const mine = m.user.id === user?.id;
                    const isStaff = m.role !== 'USER';
                    return (
                      <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                        <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', mine ? 'bg-neon-cyan/15 border border-neon-cyan/25' : 'bg-cyber-800 border border-white/10')}>
                          <div className={cn('flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide mb-0.5', mine ? 'text-neon-cyan' : isStaff ? 'text-amber-400' : 'text-gray-500')}>
                            {isStaff && <ShieldCheck size={10} />}
                            {m.user.fullName} {isStaff && <span>· Staff</span>}
                          </div>
                          <p className="whitespace-pre-wrap break-words">{m.message}</p>
                          <p className="flex items-center justify-end gap-1 text-[9px] text-gray-600 mt-1">
                            {new Date(m.createdAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                            {mine && <CheckCheck size={10} className="text-neon-cyan" />}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pt-2 border-t border-white/10 flex items-end gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Javob yozing..."
                  rows={1}
                  className="glass-input flex-1 rounded-xl px-3 py-2 text-sm outline-none resize-none max-h-24"
                />
                <button onClick={send} disabled={sending || !text.trim()} className="w-10 h-10 rounded-xl neon-btn grid place-items-center disabled:opacity-40 shrink-0">
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}