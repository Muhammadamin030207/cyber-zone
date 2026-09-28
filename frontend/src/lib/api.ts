import axios from 'axios';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  // Backend javob bermasa, cheksiz spinner qolmasligi uchun.
  timeout: 20000,
});

/**
 * Texnik xatolarni (stack trace, DB nomi, HTTP status) foydalanuvchiga
 * ko'rsatilmaydigan oddiy matnlarga aylantiradi.
 *
 * Ortiqcha qatlam: `fallback` — chaqiruvchi nuqta uchun maxsus matn.
 */
export function getApiErrorMessage(err: unknown, fallback = 'Xatolik yuz berdi') {
  return humanizeApiError(err) ?? fallback;
}

/** Texnik gumoh belgilari — bular foydalanuvchiga ko'rsatilmaydi. */
const TECHNICAL_ERROR_RE =
  /traceback|axioserror|integrityerror|sequelize|prisma|uniqueconstraint|foreignkey|econnrefused|etimedout|enotfound|request failed|network error|timeout of|sqlstate|node_modules|^\s*at\s|\berror:\s|\bundefined is not|cannot read propert|fetch failed|failed to fetch|load failed|\b\d{3}\b\s*$/i;

/** HTTP status -> foydalanuvchi tili. */
const STATUS_MESSAGE: Record<number, string> = {
  400: 'So\'rov noto\'g\'ri yuborildi.',
  401: 'Sessiya tugagan. Qayta kiring.',
  403: 'Bu amalga kirish huquqingiz yo\'q.',
  404: 'Ma\'lumot topilmadi.',
  409: 'Bu ma\'lumot allaqachon mavjud.',
  413: 'Fayl hajmi juda katta.',
  422: 'Ma\'lumotlar to\'liq emas. Tekshirib qayta urinib ko\'ring.',
  429: 'Juda ko\'p urinish. Biroz kutib, qayta yuboring.',
  500: 'Serverda xatolik yuz berdi. Keyinroq urinib ko\'ring.',
  502: 'Server javob bermadi. Birozdan keyin urinib ko\'ring.',
  503: 'Xizmat vaqtincha ishlamayapti. Keyinroq urinib ko\'ring.',
  504: 'Server javob bermadi. Birozdan keyin urinib ko\'ring.',
};

/** Faqat haqiqiy, qisqa, inson uchun mo'ljallangan xabarni o'tkazamiz. */
function isUserFacingMessage(msg: unknown): msg is string {
  if (typeof msg !== 'string') return false;
  const s = msg.trim();
  if (!s || s.length > 240) return false;
  if (s.includes('\n')) return false; // ko'p qatorli = stack trace bo'lishi mumkin
  if (TECHNICAL_ERROR_RE.test(s)) return false;
  return true;
}

/** Axios xatolarining biz qiziqmaydigan qismi — `unknown` dan qisqa tip bilan o'qish. */
type ErrLike = {
  code?: unknown;
  message?: unknown;
  response?: { status?: unknown; data?: { message?: unknown } } | null;
};

/** Xatoni inson o'qiyadigan matnga aylantiradi, umuman ko'rsatib bo'lmaydigan bo'lsa `null`. */
export function humanizeApiError(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as ErrLike;

  // 1) Tarmoq / timeout — axios'ning ichki xabosini ishlatmaymiz.
  const code = typeof e.code === 'string' ? e.code : '';
  if (code === 'ECONNABORTED' || /timeout/i.test(code)) {
    return 'Ulanish sekin ketmoqda. Qayta urinib ko\'ring.';
  }
  if (code === 'ERR_NETWORK' || code === 'ECONNREFUSED' || !e.response) {
    return 'Ulanishda muammo yuz berdi. Internetni tekshirib, qayta urinib ko\'ring.';
  }

  // 2) Backend aniq foydalanuvchi xatosi yuborsa — uni hurmat qilamiz.
  const backendMessage = e.response?.data?.message;
  if (isUserFacingMessage(backendMessage)) return backendMessage.trim();

  // 3) Aks holda — status bo'yicha umumiy, xavfsiz matn.
  const status = e.response?.status;
  if (typeof status === 'number') {
    return STATUS_MESSAGE[status] ?? (status >= 500
      ? 'Serverda xatolik yuz berdi. Keyinroq urinib ko\'ring.'
      : 'So\'rovni bajarib bo\'lmadi. Ma\'lumotlarni tekshirib, qayta urinib ko\'ring.');
  }

  return null;
}

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

const authEndpointRe = /\/api\/auth\/(login|login\/google|register|refresh|logout|forgot-password|reset-password|2fa\/verify)$/;

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

export default api;