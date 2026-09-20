'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Send, X, Loader2, Moon, Ghost, Zap, type LucideIcon } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';

interface Msg {
  role: 'user' | 'bot';
  text: string;
}

const WELCOME = 'Men Cyber-Zone AI yordamchisiman 🎮\n\nSalom! Narxlar, xonalar, ish vaqti, promo-kodlar va bron haqida so\u2019rashingiz mumkin.';

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: 'bot', text: WELCOME }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
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
      setMessages((m) => [...m, { role: 'bot', text: getApiErrorMessage(err, 'Kechirasiz, xatolik yuz berdi.') }]);
    }
    setSending(false);
  }

  function quick(prompt: string) {
    setInput(prompt);
  }

  const QuickButton = ({ label, prompt, icon: Qi }: { label: string; prompt: string; icon: LucideIcon }) => (
    <button
      onClick={() => { quick(prompt); }}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-neon-cyan/25 text-neon-cyan hover:bg-neon-cyan/10 transition-colors"
    >
      <Qi size={12} /> {label}
    </button>
  );

  return (
    <>
      <div className="fixed bottom-20 md:bottom-5 right-4 md:right-5 z-[60] flex flex-col items-end gap-3">
        {open && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cyber-ZONE AI yordamchi"
            className="w-[min(94vw,380px)] rounded-2xl glass border border-neon-cyan/25 shadow-2xl overflow-hidden flex flex-col panel-pop"
          >
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-neon-cyan/15 bg-neon-cyan/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg neon-btn flex items-center justify-center">
                  <Bot size={17} />
                </div>
                <div>
                  <div className="text-sm font-bold leading-tight">CYBER-ZONE AI</div>
                  <div className="text-[10px] text-neon-green flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" /> onlayn</div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="AI yordamchini yopish"
                className="min-w-9 h-9 grid place-items-center rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
              >
                <X size={17} />
              </button>
            </div>

            {/* Quick prompts */}
            <div className="px-3 pt-3 flex flex-wrap gap-1.5 border-b border-neon-cyan/10 pb-2">
              <QuickButton label="Narxlar" prompt="Narxlar qanday?" icon={Zap} />
              <QuickButton label="Yaqin xonalar" prompt="Yaqindagi xonalarni ko'rsat" icon={Moon} />
              <QuickButton label="Promo" prompt="Promo kod bormi?" icon={Ghost} />
            </div>

            {/* Body */}
            <div ref={bodyRef} className="flex-1 overflow-y-auto max-h-[min(42vh,320px)] px-3 py-3 space-y-2.5 scrollbar-thin">
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
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-neon-cyan/15 flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Savol yozing..."
                aria-label="AI yordamchiga savol yozish"
                className="glass-input flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                aria-label="Xabar yuborish"
                className="min-w-11 h-11 rounded-xl neon-btn disabled:opacity-40 grid place-items-center"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Toggle */}
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
      </div>
    </>
  );
}