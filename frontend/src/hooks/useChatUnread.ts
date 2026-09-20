'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';

/**
 * Header chat belgisi uchun o'qilmagan xabarlar soni.
 * - /api/chat/unread orqali boshlang'ich va davriy yangilanish (polling)
 * - socket orqali jonli inkrement (chat:new, support:new)
 * Chat sahifasiga kirilganda 0 ga tushadi (sahifa componenti unread ni tozalaydi).
 */
export function useChatUnread(): number {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const [total, setTotal] = useState(0);
  const totalRef = useRef(0);

  const set = useCallback((n: number) => {
    totalRef.current = n;
    setTotal(n);
  }, []);

  // Autentifikatsiya'ga bog'liq boshlang'ich yuklash + davriy polling
  useEffect(() => {
    if (!user || !token) {
      queueMicrotask(() => set(0));
      return;
    }
    let alive = true;
    const load = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const { data } = await api.get<{ success: boolean; data: { total: number } }>('/api/chat/unread');
        if (alive) set(data.data?.total || 0);
      } catch {
        /* offline — eski qiymat saqlanadi */
      }
    };
    load();
    let timer = window.setInterval(load, 20000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        load();
        timer = window.setInterval(load, 20000);
      } else {
        window.clearInterval(timer);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, token, set]);

  // Faqat tokenni yangilashga bog'liq (socket token eskirganda qayta ulanish)
  useEffect(() => {
    if (!user || !token) return;
    const socket = getSocket();
    const bump = () => set(totalRef.current + 1);

    socket.on('chat:new', bump);
    socket.on('chat:room:new', bump);
    socket.on('support:new', bump);
    socket.on('support:thread:new', bump);

    return () => {
      socket.off('chat:new', bump);
      socket.off('chat:room:new', bump);
      socket.off('support:new', bump);
      socket.off('support:thread:new', bump);
    };
  }, [user, token, set]);

  return total;
}