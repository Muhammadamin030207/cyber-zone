'use client';

import { startRegistration, startAuthentication, platformAuthenticatorIsAvailable } from '@simplewebauthn/browser';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export interface PasskeyRecord {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt?: string | null;
  aaguid?: string | null;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage?: string;
}

export interface AIMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface AIConversation {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AIMessage[];
}

/** Brauzer platforma authenticator (Face ID/Fingerprint/Windows Hello) qo'llab-quvvatlanadimi? */
export async function supportsBiometric(): Promise<boolean> {
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

const platformName = () => {
  const s = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone|iPad|Mac/.test(s)) return 'Apple (Face ID/Touch ID)';
  if (s.includes('Android')) return 'Android biometriya';
  if (/Windows/.test(s)) return 'Windows Hello';
  if (s.includes('Linux')) return 'Biometrik qurilma';
  return 'Yangi qurilma';
};

// ============ REGISTRATION (passkey qo'shish) ============
export async function addPasskey(deviceName?: string): Promise<PasskeyRecord> {
  const { data: optsData } = await api.post<{ success: boolean; data: any }>('/api/webauthn/register/options');
  const assertion = await startRegistration({ optionsJSON: optsData.data });
  const { data: results } = await api.post<{ success: boolean; data: PasskeyRecord; message?: string }>(
    '/api/webauthn/register/verify',
    { response: assertion, deviceName: deviceName || platformName() }
  );
  return results.data;
}

// ============ PASSWORDLESS LOGIN (passkey faqat) ============
// Login sahifasi: email -> options -> brauzer so'rovi -> verify -> session.
export async function passwordlessLogin(email: string): Promise<{ success: boolean; message?: string; code?: string }> {
  const { data } = await api.post<{ success: boolean; data: { options: any; userId: string } }>('/api/webauthn/auth/options', { email });
  const assertion = await startAuthentication({ optionsJSON: data.data.options });
  const verifyRes = await api.post<
    { success: boolean; data: { user: any; accessToken: string; refreshToken: string }; message?: string; code?: string }
  >('/api/webauthn/auth/verify', { response: assertion, userId: data.data.userId });
  if (verifyRes.data?.data?.accessToken) {
    useAuthStore.getState().setAuth(verifyRes.data.data);
  }
  return { success: true, code: verifyRes.data?.code, message: verifyRes.data?.message };
}

// ============ SECOND STEP (paroldan keyin passkey, PASSKEY_REQUIRED) ============
// Server parolni tasdiqladi (pendingLoginToken) — endi passkey ham talab qilinadi.
export async function finishPasskeyLogin(
  email: string,
  pendingLoginToken: string
): Promise<{ success: boolean; message?: string; code?: string }> {
  const { data } = await api.post<{ success: boolean; data: { options: any; userId: string } }>(
    '/api/webauthn/auth/options',
    { email }
  );
  const assertion = await startAuthentication({ optionsJSON: data.data.options });
  const verifyRes = await api.post<
    { success: boolean; data: { user: any; accessToken: string; refreshToken: string; mustChangePassword?: boolean }; message?: string; code?: string }
  >('/api/webauthn/auth/verify', {
    response: assertion,
    userId: data.data.userId,
    pendingLoginToken,
  });
  if (verifyRes.data?.data?.accessToken) {
    useAuthStore.getState().setAuth(verifyRes.data.data);
  }
  return {
    success: !!verifyRes.data?.data?.accessToken,
    code: verifyRes.data?.code,
    message: verifyRes.data?.message,
  };
}