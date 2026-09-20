'use client';

import { io, Socket } from 'socket.io-client';
import { API_URL } from './api';

let socket: Socket | null = null;

function readToken(): string | null {
  try {
    const raw = localStorage.getItem('cyber-zone-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.token || null;
  } catch {
    return null;
  }
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: { token: readToken() },
      reconnection: true,
    });
  }
  return socket;
}

export function refreshSocketToken() {
  if (socket) {
    try {
      socket.auth = { token: readToken() };
    } catch {
      /* ignore */
    }
  }
}

// Access-token refresh'tan so'ng socket auth-ni yangilaymiz (eskirgan token bilan
// realtime bo'lishiga yo'l qo'ymaymiz).
if (typeof window !== 'undefined') {
  window.addEventListener('auth:refreshed', () => refreshSocketToken());
}

export function closeSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}