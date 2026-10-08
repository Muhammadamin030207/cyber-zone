// ============================================================================
// FACE VERIFICATION — PROVIDER REGISTRY
// ============================================================================
// `FACE_PROVIDER` environment kaliti tanlaydi:
//   'aws'  -> AWS Rekognition Face Liveness + Face Collection
//   'none' -> hech narsa (default) — har doim NOT_CONFIGURED
//
// QOIDА: konfiguratsiya yetishmasa `none` ga qaytadi (fail-safe) va
// hech qachon "muvaffaqiyatli" natija qaytarilmaydi. `NOT_CONFIGURED`
// — bu "hozircha mavjud emas" degan aniq holat, "xato" emas.
// ============================================================================
import { createAwsFaceProvider } from './providers/aws';
import { noneFaceProvider } from './providers/none';
import type { FaceProvider, FaceProviderId } from './types';

// Kesh FAQAT tanlangan provider bo'yicha saqlanadi — `FACE_PROVIDER`
// o'zgarsa (masalan, e2e test muhitida) yangi qaror qabul qilinadi.
// Production'da env o'zgarmaydi, shuning uchun bu singleton xatti-harakati
// bir xil qoladi.
let cachedId: FaceProviderId | null = null;
let cached: FaceProvider | null = null;

function resolveId(): FaceProviderId {
  const raw = String(process.env.FACE_PROVIDER || 'none').trim().toLowerCase();
  return raw === 'aws' ? 'aws' : 'none';
}

/**
 * Faqat o'qiladigan singleton. Provider hech qachon "yo'q" qaytarmaydi —
 * `none` provideri har doim mavjud, u har doim NOT_CONFIGURED beradi.
 */
export function getFaceProvider(): FaceProvider {
  const id = resolveId();
  if (cached && cachedId === id) return cached;
  cached = id === 'aws' ? createAwsFaceProvider() : noneFaceProvider;
  cachedId = id;
  return cached;
}

/**
 * Yuz tekshiruvi HECH QACHON ishonchli belgi qo'yishga tayyor EMASMI?
 * Faqat `VERIFIED` natijani qaytaradigan provider qo'yishi mumkin.
 * Bu — `faceVerifiedAt` yozilishining YAGONA ruxsat darvozi.
 */
export function isTrustedFaceVerificationAvailable(): boolean {
  return getFaceProvider().isConfigured();
}

export function faceProviderId(): FaceProviderId {
  return getFaceProvider().id;
}