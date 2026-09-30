'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Send, Loader2, User, Info, Trash2 } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

interface AiStatus {
  live: boolean;
  activeModel: string | null;
  fallbackOnly: boolean;
  hint: string | null;
}

export default function AiPage() {
  const t = useTranslations('ai');
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.get('/api/ai/status')
      .then(({ data }) => setStatus(data.data))
      .catch(() => setStatus({ live: false, activeModel: null, fallbackOnly: true, hint: null }));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setSending(true);
    // `history` serverga yuboriladi: oxirgi 10 ta juftlik. Navbatdagi
    // savol `messages` ichida allaqachon borligi uchun history'ga qo'shmaymiz.
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    try {
      const { data } = await api.post('/api/ai/chat', { message: text, history });
      setMessages((prev) => [...prev, { role: 'assistant', content: String(data.data?.reply ?? data.message ?? '') }]);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, t('sendFailed')));
      // Xatolik bo'lsa foydalanuvchi xabarini olib tashlaymiz — "yuborildi"
      // ko'rinib turib, javob yo'q holati chalkash bo'ladi.
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, t]);

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-2 text-sm text-gray-400">{t('authRequired')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6 sm:px-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <Bot className="text-neon-cyan" size={24} aria-hidden />
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-gray-400">{t('subtitle')}</p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/12 px-3 text-xs font-semibold text-gray-300 hover:bg-white/5"
          >
            <Trash2 size={13} aria-hidden />
            {t('clear')}
          </button>
        )}
      </header>

      {status?.fallbackOnly && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-200">
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {t('fallbackNotice')}
            {status.hint ? ` ${status.hint}` : ''}
          </span>
        </p>
      )}
      {status?.live && status.activeModel && (
        <p className="mb-4 rounded-xl border border-neon-green/25 bg-neon-green/5 px-3.5 py-2 text-xs text-neon-green">
          {t('liveModel', { model: status.activeModel })}
        </p>
      )}

      <div className="flex-1 space-y-3">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-10 text-center">
            <Bot size={24} className="mx-auto mb-3 text-gray-600" aria-hidden />
            <p className="text-sm font-semibold text-gray-300">{t('emptyTitle')}</p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs text-gray-500">{t('emptyHint')}</p>
            <ul className="mx-auto mt-4 flex max-w-md flex-col gap-1.5 text-left">
              {t.raw('examples').map((ex: string, i: number) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setInput(ex)}
                    className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-xs text-gray-300 hover:border-neon-cyan/30 hover:bg-white/5"
                  >
                    {ex}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-neon-cyan/15 text-neon-cyan">
                <Bot size={14} aria-hidden />
              </span>
            )}
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === 'user' ? 'bg-neon-cyan/15 text-gray-100' : 'border border-white/10 bg-white/[0.04] text-gray-200'
              }`}
            >
              {m.content}
            </div>
            {m.role === 'user' && (
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-gray-300">
                <User size={14} aria-hidden />
              </span>
            )}
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-neon-cyan/15 text-neon-cyan">
              <Bot size={14} aria-hidden />
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
              <Loader2 size={13} className="animate-spin" aria-hidden />
              {t('thinking')}
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="sticky bottom-0 mt-4 flex gap-2 bg-gradient-to-t from-[#070a12] via-[#070a12] to-transparent pb-2 pt-3"
      >
        <label htmlFor="ai-input" className="sr-only">
          {t('inputLabel')}
        </label>
        <input
          id="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('placeholder')}
          maxLength={500}
          disabled={sending}
          className="h-11 flex-1 rounded-xl border border-white/12 bg-white/[0.04] px-3.5 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-neon-cyan/50 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label={t('send')}
          className="neon-btn grid h-11 w-11 shrink-0 place-items-center rounded-xl disabled:opacity-40"
        >
          {sending ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <Send size={17} aria-hidden />}
        </button>
      </form>
    </div>
  );
}
