import axios from 'axios';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

/**
 * DIQQAT: bu yerda ATOL `Content-Type` header'I QO'YILMAYDI.
 *
 * Nima uchun (2026-10-05 da tuzatilgan real xato — "Kamida 1 ta o'tkazma cheki
 * (screenshot) yuklang" xatosi chek fayli tanlangan holda ham chiqardi):
 *
 *   axios `transformRequest` (lib/defaults/index.js) shu qoidani ishlatadi:
 *     const hasJSONContentType = contentType.indexOf('application/json') > -1;
 *     if (isFormData) return hasJSONContentType ? JSON.stringify(formDataToJSON(data)) : data;
 *
 * Ya'ni `Content-Type: application/json` header'i instance darajasida
 * belgilangan bo'lsa, `FormData` YUBORILMAYDI — uni oddiy JSON obyektiga
 * aylantirib yuboriladi (File -> `{}`). Server `express.json()` bilan body'ni
 * oladi, `multer` multipart deb TOG'RILAMAYDI (multipart emas), shuning uchun
 * `req.files` DOIM bo'sh bo'ladi va foydalanuvchi "Kamida 1 ta chek yuklang"
 * xatosini oladi — qanchalik fayl tanlaganidan qat'i nazar.
 *
 * To'g'ri yechim: header'ni umuman belgilamaslik. Axios JSON tanas uchun
 * o'z-o'zidan `application/json` qo'yadi, `FormData` uchun esa `boundary` bilan
 * `multipart/form-data` ni BRAUZERGA qoldiradi (axios `setContentType(undefined)`).
 */
const api = axios.create({
  baseURL: API_URL,
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

/**
 * =====================================================================
 * KAMERA / MEDIADEVICE xatolarini TASHXIL OLADI (axios'ga tegishli EMAS).
 * =====================================================================
 * ROOT CAUSE (2026-10-05) — "Ulanishda muammo yuz berdi. Internetni
 * tekshirib, qayta urinib ko'ring" xabari yuz tekshiruvida chiqardi.
 *
 * Sabab `humanizeApiError`'ning quyidagi sharti edi:
 *
 *     if (code === 'ERR_NETWORK' || code === 'ECONNREFUSED' || !e.response)
 *
 * `!e.response` — "javob kelmagan" degani. LEKIN `getUserMedia` va
 * MediaPipe WASM kabi brauzer API'lari `Error`/`DOMException` OTADIGAN
 * ulardan `response` maydoni umuman YO'Q. Ya'ni bu shart ular uchun
 * ham doim `true` bo'lardi va kamera xatosi "tarmoq xatosi" deb
 * yozilardi. Natijada:
 *
 *   NotAllowedError      -> "Internetni tekshirib..."   (ruxsat yo'q edi)
 *   NotReadableError     -> "Internetni tekshirib..."   (boshqa dastur ishlatmoqda)
 *   OverconstrainedError -> "Internetni tekshirib..."   (boshqa kamera sozlamasi)
 *   AbortError           -> "Internetni tekshirib..."
 *   WASM/model yuklanmadi-> "Internetni tekshirib..."
 *
 * Bu — "internetni tekshiring" degan universal xato edi. Endi bu
 * alohida `KAMERA_XATOLARI` jadvali bilan ANIQ xabarga aylantiriladi
 * va `humanizeApiError` faqat AXIOS xatolarini hal qiladi.
 */
const KAMERA_XATOLARI: Record<string, string> = {
  NotAllowedError: 'Kameraga ruxsat berilmadi. Brauzer sozlamasida ruxsatni yoqing va qayta urinib ko‘ring.',
  PermissionDeniedError: 'Kameraga ruxsat berilmadi. Brauzer sozlamasida ruxsatni yoqing va qayta urinib ko‘ring.',
  SecurityError: 'Kamera faqat xavfsiz (HTTPS) manzilda ishlaydi.',
  NotFoundError: 'Kamera topilmadi. Qurilmada kamera ulanganligini tekshiring.',
  DevicesNotFoundError: 'Kamera topilmadi. Qurilmada kamera ulanganligini tekshiring.',
  NotReadableError: 'Kamera boshqa dastur tomonidan band. Yopib, qayta urinib ko‘ring.',
  TrackStartError: 'Kamera boshqa dastur tomonidan band. Yopib, qayta urinib ko‘ring.',
  OverconstrainedError: 'Kamera so‘ralgan sozlamalarni qo‘llab-quvvatlamaydi.',
  AbortError: 'Kamera yo‘lga chiqish vaqtida to‘xtatildi. Qayta urinib ko‘ring.',
  InvalidStateError: 'Kamera boshqa sahifa bilan band. Yopib, qayta urinib ko‘ring.',
};

const KAMERA_FALLBACK = 'Kamerani ochib bo‘lmadi. Qurilma sozlamalarini tekshiring.';

function isDomExceptionLike(e: { name?: unknown }): boolean {
  return typeof e.name === 'string' && (e.name in KAMERA_XATOLARI || e.name === 'NotSupportedError');
}

/**
 * `getUserMedia` va boshqa brauzer media xatolarini aniq, foydalanuvchiga
 * tushunarli matnga aylantiradi. `null` — bu media xatosi EMAS.
 */
export function humanizeMediaError(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { name?: unknown; message?: unknown };
  const name = typeof e.name === 'string' ? e.name : '';
  if (name && name in KAMERA_XATOLARI) return KAMERA_XATOLARI[name];
  if (name === 'NotSupportedError') return 'Bu brauzer kamera tekshiruvini qo‘llab-quvvatlamaydi.';
  // `getUserMedia` ba'zi brauzerlarda ism bilan emas, `message` orqali
  // xabar beradi (masalan eski Safari: "Permission denied").
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  if (msg) {
    if (msg.includes('permission') || msg.includes('denied')) return KAMERA_XATOLARI.NotAllowedError;
    if (msg.includes('notfound') || msg.includes('not found') || msg.includes('requested device')) {
      return KAMERA_XATOLARI.NotFoundError;
    }
    if (msg.includes('in use') || msg.includes('busy') || msg.includes('notreadable')) {
      return KAMERA_XATOLARI.NotReadableError;
    }
  }
  return null;
}

/**
 * Yuz/nazorat modeli (MediaPipe WASM, `.task` model) YUKLAMASLIGI xatolarini
 * hal qiladi. Bular tarmoq emas — model fayli/CDN muammosi.
 */
export function humanizeModelLoadError(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { message?: unknown };
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  if (
    msg.includes('failed to fetch') ||
    msg.includes('dynamically imported') ||
    msg.includes('webassembly') ||
    msg.includes('wasm') ||
    msg.includes('face_landmarker')
  ) {
    return 'Yuzni aniqlash moduli yuklanmadi. Internetni tekshirib, sahifani yangilang.';
  }
  return null;
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
  isAxiosError?: unknown;
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
  // `ERR_NETWORK` — CORS, DNS, TLS yoki Render cold-start. Bu HAQIQI tarmoq xatosi.
  if (code === 'ERR_NETWORK' || code === 'ECONNREFUSED') {
    return 'Server bilan aloqa o‘rnatib bo‘lmadi. Qayta urinib ko‘ring.';
  }

  // 2) JAVOB QAYTGAN bo'lsa — bu tarmoq xatosi EMAS.
  //    Backend aniq foydalanuvchi xatosi yuborsa — uni hurmat qilamiz.
  if (e.response) {
    const backendMessage = e.response?.data?.message;
    if (isUserFacingMessage(backendMessage)) return backendMessage.trim();
    const status = e.response?.status;
    if (typeof status === 'number') {
      return STATUS_MESSAGE[status] ?? (status >= 500
        ? 'Serverda xatolik yuz berdi. Keyinroq urinib ko\'ring.'
        : 'So\'rovni bajarib bo\'lmadi. Ma\'lumotlarni tekshirib, qayta urinib ko\'ring.');
    }
    return null;
  }

  // 3) JAVOB YO'Q — lekin bu hali ham "internet" emas.
  //    Kamera (DOMException) va model (WASM) xatolari shu yerda ajratiladi;
  //    ular avval "Internetni tekshirib" deb ko'rsatilardi (ROOT CAUSE).
  const media = humanizeMediaError(e);
  if (media) return media;
  const model = humanizeModelLoadError(e);
  if (model) return model;

  // 4) Qolgan javobsiz xatolar:
  //    - `e.isAxiosError` true  -> request yuborildi, javob umuman kelmadi
  //                                (Render cold start, mobil tarmoq uzilishi).
  //    - `e.isAxiosError` false -> bu axios xatosi EMAS; bu oddiy `Error`,
  //                                ya'ni frontend kodi. Uni "tarmoq" dema.
  if (e.isAxiosError === true) {
    return 'Server bilan aloqa o‘rnatib bo‘lmadi. Qayta urinib ko‘ring.';
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
  // XAVFSIZLIK QATLAMI #2 (asosiy tuzatma yuqorida `axios.create` da):
  // `FormData` yuborilayotgan har qanday so'rovda `Content-Type` MAVJUD
  // bo'lsa, axios uni JSON deb hisoblab fayllarni yo'qotadi. `boundary` ni
  // qo'lda yozish ham xato — shuning uchun header'ni butunlay O'CHIRAMIZ va
  // buni brauzer/FormData implementatsiyasiga qoldiramiz.
  if (isFormDataBody(config.data) && config.headers) {
    config.headers.delete?.('Content-Type');
  }
  return config;
});

/** `data` FormData yoki undan yig'ilgan URLSearchParams bo'limi. */
function isFormDataBody(data: unknown): boolean {
  if (typeof FormData === 'undefined' || !data) return false;
  if (data instanceof FormData) return true;
  return (
    typeof URLSearchParams !== 'undefined' &&
    data instanceof URLSearchParams
  );
}

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