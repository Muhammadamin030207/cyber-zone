'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api, { setAccessToken, setRefreshToken, getApiErrorMessage } from '@/lib/api';
import type { AuthResponse, User } from '@/lib/types';

export interface LoginResult {
  success: boolean;
  code?: string;
  message?: string;
  data?: AuthResponse;
  pendingLoginToken?: string;
  userId?: string;
  mustChangePassword?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  initialized: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  googleLogin: (idToken: string) => Promise<{ data?: { data?: { pendingRegister?: boolean; profile?: any; user?: User } } } | undefined>;
  register: (data: { email: string; password?: string; fullName: string; phone?: string; language?: string; googleToken?: string }) => Promise<void>;
  logout: () => Promise<void>;
  setAuth: (auth: AuthResponse) => void;
  updateUser: (patch: Partial<User>) => void;
  setNewPassword: (newPassword: string, currentPassword?: string) => Promise<void>;
  fetchMe: () => Promise<void>;
  clearError: () => void;
  error: string | null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      initialized: false,
      loading: false,
      error: null,

      setAuth: (auth) => {
        setAccessToken(auth.accessToken);
        setRefreshToken(auth.refreshToken || null);
        set({ user: auth.user, token: auth.accessToken, refreshToken: auth.refreshToken || null, error: null });
      },

      updateUser: (patch) => {
        const current = get().user;
        if (!current) return;
        set({ user: { ...current, ...patch } });
      },

      login: async (email, password): Promise<LoginResult> => {
        set({ loading: true, error: null });
        try {
          const res = await api.post<{
            success: boolean;
            code?: string;
            message?: string;
            data?: AuthResponse & { userId?: string; pendingLoginToken?: string; mustChangePassword?: boolean };
          }>('/api/auth/login', { email, password });

          // Oddiy muvaffaqiyatli login
          if (res.data?.success && res.data?.data) {
            get().setAuth(res.data.data);
            return { success: true, data: res.data.data };
          }

          // PASSKEY_REQUIRED (202): parol to'g'ri, passkey ikkinchi bosqichi kerak
          if (res.data?.code === 'PASSKEY_REQUIRED' && res.data?.data) {
            set({ error: null });
            return {
              success: false,
              code: res.data.code,
              message: res.data.message,
              pendingLoginToken: res.data.data.pendingLoginToken,
              userId: res.data.data.userId,
              mustChangePassword: res.data.data.mustChangePassword,
            };
          }

          // TWO_FACTOR_REQUIRED (202): parol to'g'ri, TOTP kodi kerak
          if (res.data?.code === 'TWO_FACTOR_REQUIRED' && res.data?.data) {
            set({ error: null });
            return {
              success: false,
              code: res.data.code,
              message: res.data.message,
              pendingLoginToken: res.data.data.pendingLoginToken,
              userId: res.data.data.userId,
            };
          }

          // MUST_CHANGE_PASSWORD: temp parol bilan kirdi — yangi parol majburiy
          if (res.data?.code === 'MUST_CHANGE_PASSWORD' && res.data?.data) {
            if (res.data.data.accessToken) get().setAuth(res.data.data);
            return {
              success: false,
              code: res.data.code,
              message: res.data.message,
              data: res.data.data as AuthResponse,
              mustChangePassword: true,
            };
          }

          set({ error: res.data?.message || 'Kirishda xatolik' });
          return { success: false, code: res.data?.code, message: res.data?.message };
        } catch (err) {
          set({ error: getApiErrorMessage(err, 'Kirishda xatolik') });
          throw err;
        } finally {
          set({ loading: false });
        }
      },

      register: async (form) => {
        set({ loading: true, error: null });
        try {
          const { data } = await api.post<{ success: boolean; data: AuthResponse }>('/api/auth/register', {
            ...form,
            language: 'uz',
          });
          get().setAuth(data.data);
        } catch (err) {
          set({ error: getApiErrorMessage(err, "Ro'yxatdan o'tishda xatolik") });
          throw err;
        } finally {
          set({ loading: false });
        }
      },

      googleLogin: async (idToken) => {
        set({ loading: true, error: null });
        try {
          const res = await api.post<{ success: boolean; data: AuthResponse & { pendingRegister?: boolean; profile?: any } }>('/api/auth/login/google', {
            token: idToken,
          });
          if (res.data?.data?.pendingRegister) return res;
          if (res.data?.data?.user) get().setAuth(res.data.data);
          return res;
        } catch (err) {
          set({ error: getApiErrorMessage(err, 'Google bilan kirishda xatolik') });
          throw err;
        } finally {
          set({ loading: false });
        }
      },

      logout: async () => {
        // Server-side sessiyani bekor qilish (tokenVersion++). Tarmoq xatosi bo'lsa
        // ham lokal holat tozalanadi (foydalanuvchi tizimdan chiqqan hisoblanadi).
        try {
          if (get().token) await api.post('/api/auth/logout');
        } catch {
          /* ignore — lokal logout baribir bajariladi */
        }
        setAccessToken(null);
        setRefreshToken(null);
        set({ user: null, token: null, refreshToken: null });
      },

      setNewPassword: async (newPassword, currentPassword) => {
        await api.post('/api/auth/set-new-password', { newPassword, currentPassword });
        // Parol almashdi — lokal foydalanuvchi tozalanadi, qayta login talab qilinadi
        setAccessToken(null);
        setRefreshToken(null);
        set({ user: null, token: null, refreshToken: null });
      },

      fetchMe: async () => {
        if (!get().token) {
          set({ initialized: true });
          return;
        }
        setAccessToken(get().token);
        setRefreshToken(get().refreshToken || null);
        try {
          const { data } = await api.get<{ success: boolean; data: User }>('/api/auth/me');
          set({ user: data.data, initialized: true });
        } catch {
          set({ user: null, token: null, refreshToken: null, initialized: true });
          setAccessToken(null);
          setRefreshToken(null);
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'cyber-zone-auth',
      partialize: (state) => ({ token: state.token, refreshToken: state.refreshToken, user: state.user }),
    }
  )
);