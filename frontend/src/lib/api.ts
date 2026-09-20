import axios from 'axios';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

const authEndpointRe = /\/api\/auth\/(login|login\/google|register|refresh|forgot-password|reset-password)$/;

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !authEndpointRe.test(err.config?.url || '')) {
      const event = new CustomEvent('auth:unauthorized');
      window.dispatchEvent(event);
    }
    return Promise.reject(err);
  }
);

export function getApiErrorMessage(err: any, fallback = 'Xatolik yuz berdi') {
  return err?.response?.data?.message || err?.message || fallback;
}

export default api;