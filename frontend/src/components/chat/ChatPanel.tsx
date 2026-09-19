'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MessageSquare, Send, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import { cn, mergeChatMessages } from '@/lib/utils';

interface Msg {
  id: string;
  message: string;
  role: string;
  isRead: boolean;
  createdAt: string;
  user: { id: string; fullName: string; role: string };
}

export default function ChatPanel({ roomId, roomName }: { roomId: string; roomName: string }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api
      .get(`/api/chat/rooms/${roomId}/messages`)
      .then(({ data }) => { if (!cancelled) setMessages(data.data || []); })
      .catch(() => { /* skip */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [roomId, user]);

  // Jonli yangilanishlar (socket uchun)
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    socket.emit('register', user.id);
    socket.emit('joinRoom', roomId);
    const handler = (payload: { roomId: string; message: Msg }) => {
      if (payload.roomId !== roomId) return;
      setMessages((m) => mergeChatMessages(m, payload.message));
    };
    socket.on('chat:room:new', handler);
    socket.on('chat:new', handler);
    return () => {
      socket.off('chat:room:new', handler);
      socket.off('chat:new', handler);
      socket.emit('leaveRoom', roomId);
    };
  }, [roomId, user]);

  // Polling fallback — refresh'siz (socket ulana olmasa ham) xabarlar kelib turishi uchun
  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(async () => {
      try {
        const { data } = await api.get(`/api/chat/rooms/${roomId}/messages`);
        setMessages((m) => mergeChatMessages(m, data.data || []));
      } catch { /* skip */ }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [roomId, user]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [messages.length]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    setErr(null);
    try {
      const { data } = await api.post(`/api/chat/rooms/${roomId}/messages`, { message: text });
      setMessages((m) => mergeChatMessages(m, data.data));
      setText('');
    } catch (e) {
      setErr(getApiErrorMessage(e));
    }
    setSending(false);
  }

  if (!user) {
    return (
      <div className="neo-card rounded-2xl p-6 text-center">
        <MessageSquare size={28} className="mx-auto mb-3 text-neon-cyan" />
        <p className="text-gray-300 mb-4">Suhbatda ishtirok etish uchun kiring</p>
        <button
          onClick={() => router.push(`/login?redirect=/rooms/${roomId}`)}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl neon-btn text-sm font-bold"
        >
          <LogIn size={15} /> Kirish
        </button>
      </div>
    );
  }

  return (
    <div className="neo-card rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-neon-cyan/15 bg-gradient-to-r from-neon-cyan/10 via-transparent to-neon-green/10 flex items-center justify-between">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <MessageSquare size={18} className="text-neon-green" /> Live Chat <span className="text-sm font-medium text-gray-500">· {roomName}</span>
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-neon-green">
          <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" /> Online
        </span>
      </div>

      <div ref={boxRef} className="h-80 overflow-y-auto scrollbar-thin p-5 space-y-2.5">
        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg bg-cyber-800 animate-pulse w-3/5" />)}</div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-12">Xabar yo&apos;q. Birinchi bo&apos;lib yozing! 💬</p>
        ) : (
          messages.map((m) => {
            const mine = m.user.id === user.id;
            const isStaff = m.role !== 'USER';
            return (
              <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', mine ? 'bg-neon-cyan/15 border border-neon-cyan/25 text-gray-100' : 'bg-cyber-800 border border-white/10 text-gray-200')}>
                  <div className={cn('flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide mb-0.5', mine ? 'text-neon-cyan' : isStaff ? 'text-amber-400' : 'text-gray-500')}>
                    {isStaff && <ShieldCheck size={10} />}
                    {mine ? user.fullName : m.user.fullName}
                    {isStaff && <span>· Staff</span>}
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

      {err && <p className="px-5 pb-2 text-xs text-red-400">{err}</p>}

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
    </div>
  );
}