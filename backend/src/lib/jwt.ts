import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import { config } from '../config';
import { JwtPayload } from '../types';

/**
 * Token turlari (JWT `type` claim).
 *
 * MUHIM: `pending-2fa` va `pending-passkey` tokenlari ikkinchi faktor
 * tasdiqlanmagicha beriladigan "oraliq" tokenlar. Ular ACCESS token bilan
 * BIR XIL secret bilan imzolanadi, shuning uchun `type` claim tekshiruvsiz
 * ular to'liq API kirishida ishlatilishi mumkin edi (2FA/passkey bypass).
 * Endi har bir token turi aniq belgilanadi va `verifyAccessToken` faqat
 * `access` tokenini qabul qiladi.
 */
export type TokenType = 'access' | 'refresh' | 'pending-2fa' | 'pending-passkey';

export interface TypedJwtPayload extends JwtPayload {
  type?: TokenType;
}

export class TokenTypeError extends Error {
  code = 'TOKEN_TYPE_INVALID';
  constructor() {
    super('Token turi mos emas');
    this.name = 'TokenTypeError';
  }
}

export function generateTokens(payload: JwtPayload) {
  const accessToken = jwt.sign({ ...payload, type: 'access' }, config.jwt.secret as Secret, {
    expiresIn: config.jwt.accessExpires as SignOptions['expiresIn'],
  });
  const refreshToken = jwt.sign({ ...payload, type: 'refresh' }, config.jwt.refreshSecret as Secret, {
    expiresIn: config.jwt.refreshExpires as SignOptions['expiresIn'],
  });
  return { accessToken, refreshToken };
}

/**
 * Ikkinchi faktor (2FA / passkey) tasdiqlanmagicha beriladigan oraliq token.
 * FAQAT shu endpointlarda ishlatiladi: /2fa/verify va /webauthn/auth/verify.
 * Bu token `authenticate` middleware'idan o'ta OLMAYDI — `verifyAccessToken`
 * `type !== 'access'` bo'lsa rad etadi.
 */
export function generatePendingLoginToken(userId: string, type: 'pending-2fa' | 'pending-passkey'): string {
  return jwt.sign({ userId, type }, config.jwt.secret as Secret, { expiresIn: '5m' });
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwt.secret as Secret) as TypedJwtPayload;
  // XAVFSIZLIK CHEGARASI: faqat haqiqiy access token. 'pending-*' tokenlar
  // (2FA/passkey hali tasdiqlanmagan) bu nuqtada rad etiladi.
  if (!decoded || decoded.type !== 'access') throw new TokenTypeError();
  return decoded;
}

export function verifyRefreshToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwt.refreshSecret as Secret) as TypedJwtPayload;
  // Refresh token hech qachon 'pending-*' yoki 'access' bo'lmasligi kerak.
  // `type` yo'q bo'lsa (deploy'dan oldingi token) qabul qilinadi — 7 kunlik
  // tokenlarni birdan bekor qilmaslik uchun.
  if (decoded?.type && decoded.type !== 'refresh') throw new TokenTypeError();
  return decoded;
}

/** Oraliq token turini tekshiradi (2FA / passkey verify bosqichlari uchun). */
export function verifyPendingToken(token: string, expected: 'pending-2fa' | 'pending-passkey'): { userId: string } {
  const decoded = jwt.verify(token, config.jwt.secret as Secret) as TypedJwtPayload;
  if (!decoded || decoded.type !== expected || !decoded.userId) throw new TokenTypeError();
  return { userId: decoded.userId };
}
