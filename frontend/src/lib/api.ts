import axios from 'axios';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setRefreshToken(token: string | null) {
  refreshToken = token;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

const authEndpointRe = /\/api\/auth\/(login|login\/google|register|refresh|forgot-password|reset-password)$/;

// Refresh-token bilan yangi access token olish (single-flight — parallel 401'lar
// bitta refresh chaqiruvini baham ko'radi). Muvaffaqiyat: auth:refreshed event.
async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  if (!refreshPromise) {
    refreshPromise = axios
      .post<{ success: boolean; data: { accessToken: string; refreshToken: string } }>(`${API_URL}/api/auth/refresh`, { refreshToken })
      .then(({ data }) => {
        const d = data?.data;
        if (!d?.accessToken) return false;
        accessToken = d.accessToken;
        refreshToken = d.refreshToken || refreshToken;
        try {
          window.dispatchEvent(new CustomEvent('auth:refreshed'));
        } catch {
          /* ignore */
        }
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const cfg = err.config as (typeof err.config & { _retried?: boolean }) | undefined;
    const url = cfg?.url || '';
    const status = err.response?.status;
    const isAuthEndpoint = authEndpointRe.test(url) || url.startsWith('/api/auth/refresh');
    if (status === 401 && !isAuthEndpoint && !cfg?._retried) {
      if (cfg) cfg._retried = true;
      const refreshed = await tryRefresh();
      if (refreshed && cfg) {
        cfg.headers = cfg.headers || {};
        cfg.headers.Authorization = `Bearer ${accessToken}`;
        return api(cfg);
      }
      try {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      } catch {
        /* ignore */
      }
    }
    return Promise.reject(err);
  }
);

export function getApiErrorMessage(err: any, fallback = 'Xatolik yuz berdi') {
  return err?.response?.data?.message || err?.message || fallback;
}

export default api;