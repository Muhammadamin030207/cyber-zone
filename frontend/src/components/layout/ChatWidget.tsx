'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, X, Loader2, Trash2, Sparkles, Calendar, Info, Monitor, Wallet, ListOrdered } from 'lucide-react';
import Link from 'next/link';
import api, { getApiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface Msg {
  role: 'user' | 'bot';
  text: string;
}

const WELCOME =
  'Men Cyber-ZONE AI yordamchisiman 🎮\n\nNarxlar, xonalar, ish vaqti, promo-kodlar va bron haqida so\u2019rashingiz mumkin. Bron va to\u2019lov holati bo\u2019yicha aniq savollarga ham javob beraman.';

const SUGGESTIONS = [
  { label: 'Bu nima?', prompt: 'Cyber-ZONE nima?', icon: Info },
  { label: 'Bugun bron', prompt: 'Bugun bron qilish mumkinmi?', icon: Calendar },
  { label: "Bo'sh vaqtlar", prompt: 'Qaysi vaqtlar bo\'sh?', icon: Monitor },
  { label: "Bronlarim", prompt: 'Mening bronlarimni ko\'rsat', icon: ListOrdered },
  { label: "To'lov", prompt: 'To\'lov qanday ishlaydi?', icon: Wallet },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767.98px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

export default function ChatWidget() {
  const isMobile = useIsMobile();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: 'bot', text: WELCOME }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mobile: klaviatura qo'zg'alganda ko'rinadigan viewportga moslashish (iOS-safe)
  const [vbHeight, setVbHeight] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const onVb = () => setVbHeight(window.visualViewport!.height);
    window.visualViewport.addEventListener('resize', onVb);
    window.visualViewport.addEventListener('scroll', onVb);
    onVb();
    return () => {
      window.visualViewport?.removeEventListener('resize', onVb);
      window.visualViewport?.removeEventListener('scroll', onVb);
    };
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, open, sending]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    // Foydalanuvchi kirgan bo'lsa inputga fokus beramiz (keyboard UX)
    const t = setTimeout(() => {
      if (user) inputRef.current?.focus();
    }, 150);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, user]);

  async function send(rawPrompt?: string) {
    const text = (rawPrompt ?? input).trim();
    if (!text || sending || !user) return;
    setInput('');
    const history = [...messages, { role: 'user', text } as Msg]
      .filter((m) => !(m.role === 'bot' && m.text === WELCOME))
      .slice(-8)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
    setMessages((m) => [...m, { role: 'user', text }]);
    setSending(true);
    try {
      const { data } = await api.post<{ success: boolean; data: { reply: string } }>('/api/ai/chat', { message: text, history });
      setMessages((m) => [...m, { role: 'bot', text: data.data.reply }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'bot', text: getApiErrorMessage(err, 'Kechirasiz, AI xizmatida vaqtinchalik muammo yuz berdi. Yana urinib ko\u2019ring.') }]);
    }
    setSending(false);
  }

  function clearChat() {
    setMessages([{ role: 'bot', text: WELCOME }]);
  }

  return (
    <>
      {/* Mobile: to'liq ekran bottom-sheet (klaviatura bilan mos) */}
      {open && isMobile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cyber-ZONE AI yordamchi"
          style={{ height: vbHeight ? `${vbHeight}px` : '100dvh' }}
          className="fixed left-0 bottom-0 w-full z-[80] bg-cyber-950/95 backdrop-blur-xl border-t border-neon-cyan/25 flex flex-col ai-sheet overflow-hidden"
        >
          <AiHeader
            sending={sending}
            user={!!user}
            onClose={() => setOpen(false)}
            onClear={clearChat}
            canClear={messages.length > 1}
          />
          <AiBody
            bodyRef={bodyRef as any}
            messages={messages}
            sending={sending}
            empty={messages.length <= 1}
            user={!!user}
            onSuggestion={(p) => send(p)}
          />
          <div
            className="px-3 pt-3 border-t border-neon-cyan/15 flex items-end gap-2"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
          >
            <AiInput
              value={input}
              onChange={setInput}
              onSend={() => send()}
              sending={sending}
              disabled={!user}
              ref={inputRef}
            />
          </div>
        </div>
      )}

      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-5 right-4 md:right-6 z-[70] flex flex-col items-end gap-3">
        {/* Desktop: floating panel */}
        {open && !isMobile && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cyber-ZONE AI yordamchi"
            className="w-[min(420px,94vw)] h-[min(600px,calc(100vh-10rem))] rounded-2xl glass border border-neon-cyan/25 shadow-2xl overflow-hidden flex flex-col panel-pop"
          >
            <AiHeader
              sending={sending}
              user={!!user}
              onClose={() => setOpen(false)}
              onClear={clearChat}
              canClear={messages.length > 1}
            />
            <AiBody
              bodyRef={bodyRef as any}
              messages={messages}
              sending={sending}
              empty={messages.length <= 1}
              user={!!user}
              onSuggestion={(p) => send(p)}
            />
            <div className="px-3 py-3 border-t border-neon-cyan/15 flex items-end gap-2">
              <AiInput value={input} onChange={setInput} onSend={() => send()} sending={sending} disabled={!user} ref={inputRef} />
            </div>
          </div>
        )}

        {/* Toggle (mobile'da ochiq holda yashirin) */}
        {!(open && isMobile) && (
          <button
            ref={toggleRef}
            onClick={() => setOpen((o) => !o)}
            className="w-14 h-14 rounded-full neon-btn ai-fab flex items-center justify-center text-white"
            aria-label={open ? 'AI yordamchini yopish' : 'AI yordamchini ochish'}
            aria-expanded={open}
            data-tip={open ? 'Yopish' : 'AI yordamchi'}
          >
            {open ? <X size={22} /> : <Bot size={24} />}
          </button>
        )}
      </div>
    </>
  );
}

interface HeaderProps {
  sending: boolean;
  user: boolean;
  onClose: () => void;
  onClear: () => void;
  canClear: boolean;
}

function AiHeader({ sending, user, onClose, onClear, canClear }: HeaderProps) {
  return (
    <div className="px-4 py-3 flex items-center justify-between border-b border-neon-cyan/15 bg-neon-cyan/5 shrink-0">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg neon-btn flex items-center justify-center">
          <Bot size={17} />
        </div>
        <div>
          <div className="text-sm font-bold leading-tight">CYBER-ZONE AI</div>
          <div className="text-[10px] text-gray-400 flex items-center gap-1">
            {sending ? (
              <>
                <Loader2 size={10} className="animate-spin text-neon-cyan" /> javob tayyorlanmoqda...
              </>
            ) : user ? (
              <>
                <Sparkles size={10} className="text-neon-cyan" /> yordamchi
              </>
            ) : (
              'kirish talab qilinadi'
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {canClear && (
          <button
            onClick={onClear}
            aria-label="Suhbatni tozalash"
            className="min-w-9 h-9 grid place-items-center rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <Trash2 size={15} />
          </button>
        )}
        <button
          onClick={onClose}
          aria-label="AI yordamchini yopish"
          className="min-w-9 h-9 grid place-items-center rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
        >
          <X size={17} />
        </button>
      </div>
    </div>
  );
}

interface BodyProps {
  bodyRef: React.RefObject<HTMLDivElement | null>;
  messages: Msg[];
  sending: boolean;
  empty: boolean;
  user: boolean;
  onSuggestion: (prompt: string) => void;
}

function AiBody({ bodyRef, messages, sending, empty, user, onSuggestion }: BodyProps) {
  return (
    <div ref={bodyRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 scrollbar-thin">
      {!user ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-gray-300 mb-3">
            AI yordamchi <span className="text-neon-cyan">Cyber-ZONE</span> haqidagi savollarga javob beradi va
            bron/to&apos;lov holatingizni ko&apos;rsatadi.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Link
              href="/login"
              className="px-4 py-2 rounded-xl neon-btn text-sm"
            >
              Kirish
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 rounded-xl text-sm border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 transition-colors"
            >
              Ro&apos;yxatdan o&apos;tish
            </Link>
          </div>
        </div>
      ) : (
        <>
          {empty && (
            <div className="px-1 pb-1">
              <p className="text-xs text-gray-500 mb-2">Qanday yordam bera olaman? Quyidagilardan birini tanlang yoki o&apos;z savolingizni yozing:</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.prompt}
                    onClick={() => onSuggestion(s.prompt)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-neon-cyan/25 text-neon-cyan hover:bg-neon-cyan/10 transition-colors"
                  >
                    <s.icon size={12} /> {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  msg.role === 'user'
                    ? 'max-w-[80%] px-3 py-2 rounded-2xl rounded-br-sm neon-btn text-sm whitespace-pre-line break-words'
                    : 'max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-sm bg-cyber-800/80 border border-neon-cyan/15 text-sm whitespace-pre-line break-words text-gray-200'
                }
              >
                {msg.text}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-cyber-800/80 border border-neon-cyan/15 flex items-center gap-2 text-sm text-gray-400">
                <Loader2 size={14} className="animate-spin text-neon-cyan" /> yozmoqda...
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface InputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  disabled: boolean;
}

const AiInput = React.forwardRef<HTMLInputElement, InputProps>(function AiInput(
  { value, onChange, onSend, sending, disabled },
  ref
) {
  return (
    <>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={disabled ? 'Avval tizimga kiring' : 'Savol yozing...'}
        aria-label="AI yordamchiga savol yozish"
        disabled={disabled}
        className="glass-input flex-1 rounded-xl px-3 py-2.5 text-sm outline-none disabled:opacity-50"
      />
      <button
        onClick={onSend}
        disabled={sending || disabled || !value.trim()}
        aria-label="Xabar yuborish"
        className="min-w-11 h-11 rounded-xl neon-btn disabled:opacity-40 grid place-items-center"
      >
        <Send size={16} />
      </button>
    </>
  );
});