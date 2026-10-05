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
import { config } from '../../config';

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
  if (cached) return cached;
  const id = resolveId();
  cached = id === 'aws' ? createAwsFaceProvider() : noneFaceProvider;
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