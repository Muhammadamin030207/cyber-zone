// ============================================================================
// FACE VERIFICATION — PROVIDER KONTRAKTI
// ============================================================================
// "Face ID" (qurilma biometrikasi / FaceID.app) BU bilan aralashmasin.
// Bu — KAMERA orqali haqiqiy yuzni tekshirish: mijoz kim ekanini
// tasdiqlash (1:1 match) va/yo'q jonli ekanini isbotlash (liveness).
// Qurilma biometrikasi alohida protokol: WebAuthn/Passkey (§ Passkey).
//
// ISHONCH ZARGARASI: `faceVerifiedAt` / `faceVerifiedById` yozilishi
// FAQAT shu kontraktni bajaradigan provider qaytargan `VERIFIED`
// natijasidan keladi. Mijozning so'rovi, so'rov tanasi, `userId` —
// hech qachon natija emas.
//
// FAIL-CLOSED: provider sozlanmagan bo'lsa `NOT_CONFIGURED`. Hech
// qachon "yarim tekshirilgan" natija qaytarilmaydi va hech qachon
// `verified: true` sun'iy yaratilmaydi.
// ============================================================================

export type FaceProviderId = 'aws' | 'none';

/**
 * Tahrirlash uchun yagona "ishonchli" natija. `providerRef` — provider
 * tomonidagi qaytarilgan ID (AWS `SessionId` / `FaceId`); u DB'da
 * saqlanadi va keyin verifikatsiya (masofaviy audit) uchun ishlatiladi.
 */
export interface FaceVerificationOutcome {
  /** Faqat `VERIFIED` bo'lganda `faceVerifiedAt` yoziladi. */
  status: 'VERIFIED';
  /** Provider tomonidan berilgan, keyinchalik tekshirish uchun saqlanadi. */
  providerRef: string;
  /** Liveness isboti (provider bergan). UI da ko'rsatish uchun. */
  livenessPassed?: boolean;
  /** Enum? o'xshash metama'lumot — log/audit uchun. */
  confidence?: number;
}

/**
 * Provider xatolari — HTTP status emas, kod bilan. Frontend shu kodlarni
 * o'z xabarlariga xaritalaydi (texnik jargon foydalanuvchiga chiqmaydi).
 */
export type FaceProviderErrorCode =
  /** Konfiguratsiya yo'q — `FACE_PROVIDER=none` yoki kalitlar yetishmaydi. */
  | 'NOT_CONFIGURED'
  /** Provider ishlayapti, lekin vaqtinchalik xato (5xx / tarmoq). */
  | 'PROVIDER_UNAVAILABLE'
  /** Sessiya topilmadi yoki muddati tugagan. */
  | 'SESSION_EXPIRED'
  /** Sessiya allaqachon ishlatilgan (replay). */
  | 'SESSION_ALREADY_USED'
  /** Liveness/similik o'tmadi — bu "rad etish", "xato" EMAS. */
  | 'VERIFICATION_FAILED'
  /** Yuz topilmadi yaki sifat yetarli emas. */
  | 'FACE_NOT_DETECTED'
  /** Noto'g'ri so'rov (parametr/booking mos kelmadi). */
  | 'INVALID_REQUEST'
  /** Rate limit. */
  | 'RATE_LIMITED';

/** Frontend HTTP status va `code` juftligini qaytarish uchun xaritalash. */
export const FACE_ERROR_STATUS: Record<FaceProviderErrorCode, number> = {
  NOT_CONFIGURED: 503,
  PROVIDER_UNAVAILABLE: 502,
  SESSION_EXPIRED: 410,
  SESSION_ALREADY_USED: 409,
  VERIFICATION_FAILED: 422,
  FACE_NOT_DETECTED: 422,
  INVALID_REQUEST: 400,
  RATE_LIMITED: 429,
};

export const FACE_ERROR_MESSAGE: Record<FaceProviderErrorCode, string> = {
  NOT_CONFIGURED: 'Face Verification hozircha mavjud emas.',
  PROVIDER_UNAVAILABLE: 'Face tekshiruv serverida vaqtinchalik xatolik.',
  SESSION_EXPIRED: 'Tekshiruv sessiyasi tugagan. Qaytadan boshlang.',
  SESSION_ALREADY_USED: 'Tekshiruv allaqachon bajarilgan. Qayta boshlang.',
  VERIFICATION_FAILED: 'Yuz tasdiqlanmadi. Qayta urinib ko‘ring.',
  FACE_NOT_DETECTED: 'Yuz aniqlanmadi. Yaxshi yoritilgan joyda urinib ko‘ring.',
  INVALID_REQUEST: 'Tekshiruv so‘rovi noto‘g‘ri.',
  RATE_LIMITED: 'Juda ko‘p urinish. Biroz kutib, qayta urinib ko‘ring.',
};

/**
 * Provider sessiyasi — mijozga beriladigan "chiq" obyekti.
 * `clientToken` ni frontend `X-Face-Session` header'ida yuboradi.
 */
export interface FaceSession {
  /** Sabq (opaque) — serverda saqlangan, mijozni o'zi o'zgartira olmaydi. */
  sessionToken: string;
  /** Provider (AWS) sessiya ID — verifikatsiya paytida yuboriladi. */
  providerRef: string;
  /** Qancha vaqt ichida bajarish kerak (ms). */
  expiresInMs: number;
  /**
   * Mijoz brauzerda o'tkazish uchun minimal VAQT (ms).
   * "0ms da o'tdim" ni rad etish uchun (spec: replay protection).
   */
  minDurationMs: number;
}

export interface CreateSessionInput {
  /** Kim tekshirilmoqchi — autentifikatsiyadan keladi, mijozdan EMAS. */
  userId: string;
  /** Bu sessiya QAYERGA bog'lanadi (booking / enrollment). */
  bookingId: string;
  /** Qayta ishlashga tushmasligi kerak (idempotency). */
  nonce: string;
}

export interface VerifySessionInput {
  sessionToken: string;
  /** O'sha booking — sessiya booking bilan bog'liq bo'lishi SHART. */
  bookingId: string;
  /** Auth'dan keladigan foydalanuvchi — sessiya egasi bilan mos bo'lishi SHART. */
  userId: string;
  /** Mijoz o'lchagan umumiy o'tkazish vaqti (ms) — plausibility tekshiruvi. */
  clientDurationMs: number;
}

export interface EnrollFaceInput {
  userId: string;
  /** Ro'yxatga olishga tushgan tasvir (byte) — provider'ga yuboriladi. */
  imageBytes: Buffer;
  /** Mijoz yuzini jamlashga roziligi (yozib qo'yiladi). */
  consentGiven: boolean;
}

export interface MatchFaceInput {
  userId: string;
  imageBytes: Buffer;
  /** Minimal o'xshashlik (0..1) — default 0.9. */
  threshold?: number;
}

export interface FaceMatchResult {
  matched: boolean;
  similarity?: number;
  providerRef?: string;
}

/**
 * ======================================================================
 * FACE PROVIDER KONTRAKTI
 * ======================================================================
 * Har bir provider (AWS Rekognition, Azure Face, Regula, Jumio…) shu
 * interfeysni bajaradi. Controller provider'ni faqat shu orqali ko'radi —
 * ya'ni yangi provider qo'shishda controller kod IZGARMAS qoladi.
 *
 * QAT'IY: hech qanday implementatsiya `verified: true` ni MIJOZ so'rovi
 * asosida qaytarishi mumkin emas. Faqat o'zining haqiqiy provider
 * javobidan kelgan natijani qaytaradi.
 */
export interface FaceProvider {
  readonly id: FaceProviderId;

  /** Konfiguratsiya to'liqmi? `false` bo'lsa barcha amallar NOT_CONFIGURED. */
  isConfigured(): boolean;

  /** Foydalanuvchi uchun verifikatsiya sessiyasini ochadi. */
  createSession(input: CreateSessionInput): Promise<FaceSession>;

  /** Sessiya hali yashiringanmi / muddati tugaganmi. */
  getSessionStatus(sessionToken: string): Promise<{ state: 'ACTIVE' | 'EXPIRED' | 'USED' | 'UNKNOWN' }>;

  /**
   * Asosiy qadam: sessiyani tekshirish va natijani QAYTARISH.
   * `VERIFICATION_FAILED` — bu "rad etish", xato emas.
   */
  verifySession(input: VerifySessionInput): Promise<FaceVerificationOutcome>;

  /** Yuzni ro'yxatga oladi ( enroll ). */
  enrollFace(input: EnrollFaceInput): Promise<{ faceId: string }>;

  /** 1:1 solishtirish (masalan turnikada). */
  matchFace(input: MatchFaceInput): Promise<FaceMatchResult>;
}

/** Provider xatosi — HTTP statusni o'zi hal qilmaydi, faqat kodni oladi. */
export class FaceProviderError extends Error {
  readonly code: FaceProviderErrorCode;
  readonly detail?: string;

  constructor(code: FaceProviderErrorCode, detail?: string) {
    super(FACE_ERROR_MESSAGE[code]);
    this.name = 'FaceProviderError';
    this.code = code;
    this.detail = detail;
  }
}