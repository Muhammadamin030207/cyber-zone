// ============================================================================
// FACE PROVIDER — `none`
// ============================================================================
// Bu provider hech qanday tekshiruv QILMAYDI va hech qachon muvaffaqiyat
// qaytarmaydi. Vazifasi — "provayder yo'q" holatini ifodalash: barcha
// amallar `NOT_CONFIGUREY` (503) bilan rad etiladi, shunda frontend aniq
// "Face Verification hozircha mavjud emas" deb ko'rsatadi.
//
// Bu SUN'IY MUVAFAQIQIYATGA (fake PASS) QARSHI himoya: `none` provider
// ishlaganda hech qanday `faceVerifiedAt` yozilmaydi.
// ============================================================================
import {
  FaceProviderError,
  type CreateSessionInput,
  type EnrollFaceInput,
  type FaceMatchResult,
  type FaceProvider,
  type FaceProviderId,
  type FaceSession,
  type MatchFaceInput,
  type VerifySessionInput,
} from '../types';

function unavailable(): never {
  throw new FaceProviderError('NOT_CONFIGURED');
}

export const noneFaceProvider: FaceProvider = {
  id: 'none' as FaceProviderId,

  isConfigured() {
    return false;
  },

  async createSession(_input: CreateSessionInput): Promise<FaceSession> {
    return unavailable();
  },

  async getSessionStatus() {
    return { state: 'UNKNOWN' as const };
  },

  async verifySession(_input: VerifySessionInput): Promise<never> {
    return unavailable();
  },

  async enrollFace(_input: EnrollFaceInput): Promise<{ faceId: string }> {
    return unavailable();
  },

  async matchFace(_input: MatchFaceInput): Promise<FaceMatchResult> {
    return unavailable();
  },
};