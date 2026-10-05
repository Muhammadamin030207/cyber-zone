// ============================================================================
// FACE PROVIDER — AWS REKOGNITION (Face Liveness + Face Collection)
// ============================================================================
// REAL implementatsiya: hech qanday "stub" emas. Kalitlar (AWS_ACCESS_KEY_ID,
// AWS_SECRET_ACCESS_KEY, AWS_REGION) va Face Collection nomi yo'q bo'lsa
// `isConfigured() === false` — ya'ni NOT_CONFIGURED, hech qachon fake PASS.
//
// Ikkita alohida qadam (AWSning o'zi shu tartibni talab qiladi):
//   1) StartFaceLivenessSession  -> LivenessToken (maska/tegishni aniqlash)
//   2) GetFaceLivenessResults    -> Confidence + CanTrust (tegish yoki yuz turi)
// Ikkalasi ham TRUE bo'lgandagina `VERIFIED` qaytariladi.
//
// AKTIV HOLAT UCHUN server tomoni Redis'da saqlanadi (one-time, replay-safe):
// key = face:sess:<token> -> { bookingId, userId, providerRef, issuedAt, used }
//
// DIQQAT (AWS SDK paket sifatida qo'shilmagan): bu fayl SDK'siz ishlaydi —
// AWS imzolash (SigV4) va REST chaqiruvlari `node:crypto` bilan qo'lda
// bajariladi. Sabab: `dependencies` ga yangi og'ir paket qo'shish render
// build'ini sekinlashtiradi va AWS SDK ~100MB. Real chaqiruv esa bir xil.
// ============================================================================
import crypto from 'crypto';
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
import { isRedisConfigured, isRedisReady, redis } from '../../../lib/redis';
import { config } from '../../../config';

const SESSION_TTL_MS = 120_000;
const SESSION_PREFIX = 'face:sess:';
/** Minimal o'tkazish vaqti — "0ms da o'tdim" ni rad etish. */
const MIN_DURATION_MS = Math.max(1_000, parseInt(process.env.FACE_MIN_DURATION_MS || '6000', 10));
const MAX_DURATION_MS = Math.max(60_000, parseInt(process.env.FACE_MAX_DURATION_MS || '180000', 10));

// ---------------------------------------------------------------- SigV4 ----
function hmac(key: crypto.BinaryLike | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}
function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
/** RFC3986 — AWS canonical query uchun (bo'sh joylar kodlanadi). */
function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
}

interface AwsConfig {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  collectionId: string;
}

function awsConfig(): AwsConfig | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
  const region = process.env.AWS_REGION || 'us-east-1';
  const collectionId = process.env.AWS_FACE_COLLECTION_ID || '';
  if (!accessKeyId || !secretAccessKey || !collectionId) return null;
  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
    region,
    collectionId,
  };
}

/** AWS SigV4 imzolangan so'rovni yuboradi va JSON javobni qaytaradi. */
async function awsJson(
  cfg: AwsConfig,
  method: 'POST' | 'GET',
  pathname: string,
  query: Record<string, string>,
  body?: string
): Promise<{ status: number; json: any }> {
  const host = `rekognition.${cfg.region}.amazonaws.com`;
  const url = `https://${host}${pathname}${query ? `?${query}` : ''}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256Hex(body ?? '');
  const canonicalHeaders =
    `content-type:application/x-amz-json-1.0\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';
  const canonicalRequest = [
    method,
    pathname,
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${cfg.region}/rekognition/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  let signingKey = hmac(`AWS4${cfg.secretAccessKey}`, dateStamp);
  signingKey = hmac(signingKey, cfg.region);
  signingKey = hmac(signingKey, 'rekognition');
  signingKey = hmac(signingKey, 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-amz-json-1.0',
    'X-Amz-Date': amzDate,
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  if (cfg.sessionToken) headers['X-Amz-Security-Token'] = cfg.sessionToken;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* bo'sh yoki JSON emas */
    }
    return { status: res.status, json };
  } catch (err) {
    const e = err as Error;
    if (e.name === 'AbortError') {
      throw new FaceProviderError('PROVIDER_UNAVAILABLE', 'AWS timeout');
    }
    throw new FaceProviderError('PROVIDER_UNAVAILABLE', e.message);
  } finally {
    clearTimeout(timer);
  }
}

function awsError(status: number, json: any, what: string): FaceProviderError {
  const type = String(json?.__type || json?.code || '');
  if (status === 429 || type.includes('Throttling')) return new FaceProviderError('RATE_LIMITED', what);
  if (status === 400 && type.includes('InvalidParameter')) {
    return new FaceProviderError('INVALID_REQUEST', what);
  }
  if (status === 404 && type.includes('ResourceNotFound')) {
    // FaceCollection yo'q — bu KONFIGURATSIYA xatosi.
    return new FaceProviderError('NOT_CONFIGURED', `AWS: ${what}`);
  }
  if (status === 422 || type.includes('InvalidImage') || type.includes('InvalidParameterException')) {
    return new FaceProviderError('FACE_NOT_DETECTED', what);
  }
  return new FaceProviderError('PROVIDER_UNAVAILABLE', `AWS ${status}: ${what}`);
}

// ------------------------------------------------------------------ state ---
interface SessionState {
  b: string; // bookingId
  u: string; // userId
  p: string; // AWS LivenessToken
  iat: number;
}

export function createAwsFaceProvider(): FaceProvider {
  return {
    id: 'aws' as FaceProviderId,

    isConfigured() {
      return awsConfig() !== null;
    },

    async createSession(input: CreateSessionInput): Promise<FaceSession> {
      const cfg = awsConfig();
      if (!cfg) throw new FaceProviderError('NOT_CONFIGURED', 'AWS kalitlari yo‘q');

      // Fail-closed: sessiya holati Redis'siz saqlanmaydi.
      if (!isRedisConfigured() || !isRedisReady()) {
        throw new FaceProviderError('PROVIDER_UNAVAILABLE', 'Redis sessiya ombori tayyor emas');
      }

      const res = await awsJson(
        cfg,
        'POST',
        '/',
        { Action: 'StartFaceLivenessSession' },
        JSON.stringify({})
      );
      if (res.status !== 200) {
        throw awsError(res.status, res.json, 'StartFaceLivenessSession');
      }
      const providerRef = String(res.json?.SessionId || '');
      if (!providerRef) throw new FaceProviderError('PROVIDER_UNAVAILABLE', 'SessionId kelmadi');

      const sessionToken = crypto.randomBytes(32).toString('base64url');
      const state: SessionState = { b: input.bookingId, u: input.userId, p: providerRef, iat: Date.now() };
      try {
        await redis.set(SESSION_PREFIX + sessionToken, JSON.stringify(state), 'PX', SESSION_TTL_MS);
      } catch (err) {
        throw new FaceProviderError('PROVIDER_UNAVAILABLE', (err as Error).message);
      }

      return { sessionToken, providerRef, expiresInMs: SESSION_TTL_MS, minDurationMs: MIN_DURATION_MS };
    },

    async getSessionStatus(sessionToken: string) {
      if (typeof sessionToken !== 'string' || sessionToken.length < 16) return { state: 'UNKNOWN' as const };
      if (!isRedisConfigured() || !isRedisReady()) return { state: 'UNKNOWN' as const };
      const raw = await redis.get(SESSION_PREFIX + sessionToken).catch(() => null);
      if (!raw) return { state: 'UNKNOWN' as const };
      try {
        const s = JSON.parse(raw) as SessionState;
        if (Date.now() - s.iat > SESSION_TTL_MS) return { state: 'EXPIRED' as const };
        return { state: 'ACTIVE' as const };
      } catch {
        return { state: 'UNKNOWN' as const };
      }
    },

    async verifySession(input: VerifySessionInput) {
      const cfg = awsConfig();
      if (!cfg) throw new FaceProviderError('NOT_CONFIGURED', 'AWS kalitlari yo‘q');
      if (!isRedisConfigured() || !isRedisReady()) {
        throw new FaceProviderError('PROVIDER_UNAVAILABLE', 'Redis sessiya ombori tayyor emas');
      }
      if (typeof input.sessionToken !== 'string' || input.sessionToken.length < 16) {
        throw new FaceProviderError('INVALID_REQUEST', 'sessionToken yo‘q');
      }

      // 1) Session bitta marta o'qiladi (replay himoyasi) — GETDEL.
      let raw: string | null = null;
      try {
        try {
          raw = (await redis.call('GETDEL', SESSION_PREFIX + input.sessionToken)) as string | null;
        } catch {
          raw = await redis.get(SESSION_PREFIX + input.sessionToken);
          if (raw) await redis.del(SESSION_PREFIX + input.sessionToken);
        }
      } catch (err) {
        throw new FaceProviderError('PROVIDER_UNAVAILABLE', (err as Error).message);
      }
      if (!raw) {
        // Yo'q yoki allaqachin ishlatilgan — farqi ahamiyatli emas:
        // ikkalasida ham natija qaytarilmaydi.
        throw new FaceProviderError('SESSION_ALREADY_USED', 'Sessiya topilmadi yoki ishlatilgan');
      }

      let state: SessionState;
      try {
        state = JSON.parse(raw) as SessionState;
      } catch {
        throw new FaceProviderError('SESSION_EXPIRED', 'Sessiya buzilgan');
      }
      // 2) Session booking + user bilan bog'liq BO'LISHI SHART (IDOR himoyasi).
      if (state.b !== input.bookingId || state.u !== input.userId) {
        throw new FaceProviderError('INVALID_REQUEST', 'Sessiya boshqa booking/user ga tegishli');
      }
      // 3) O'tkazish vaqti ishonchli (soxta "0ms" ni rad etish).
      const d = input.clientDurationMs;
      if (!Number.isFinite(d) || d < MIN_DURATION_MS || d > MAX_DURATION_MS) {
        throw new FaceProviderError('VERIFICATION_FAILED', 'O‘tkazish vaqti ishonchsiz');
      }

      // 4) AWS natijasi — bu haqiqiy, server tomonidan olingan qaror.
      const res = await awsJson(
        cfg,
        'POST',
        '/',
        { Action: 'GetFaceLivenessResults' },
        JSON.stringify({ SessionId: state.p })
      );
      if (res.status !== 200) {
        throw awsError(res.status, res.json, 'GetFaceLivenessResults');
      }
      const body = res.json?.FaceLivenessResults?.FaceLivenessSessionSummary ?? res.json?.FaceLivenessSessionSummary;
      const confidence = Number(body?.Confidence ?? 0);
      const canTrust = body?.CanTrust === true || body?.CanTrust === 'True';
      if (!canTrust || confidence <= 0) {
        // Liveness o'tmadi — bu RAD ETISH, texnik xato emas.
        throw new FaceProviderError('VERIFICATION_FAILED', 'Liveness o‘tmadi');
      }

      // 5) 1:1 match — bu bron egaligini isbotlaydi.
      const frame = res.json?.FaceLivenessResults?.Frames?.[0]?.Frame;
      const b64 = frame?.Bytes ? Buffer.from(frame.Bytes).toString('base64') : null;
      if (b64) {
        const m = await awsJson(
          cfg,
          'POST',
          '/',
          { Action: 'SearchFaces' },
          JSON.stringify({
            CollectionId: cfg.collectionId,
            FaceImage: { Bytes: b64 },
            MaxFaces: 1,
            FaceMatchThreshold: Number(process.env.AWS_FACE_MATCH_THRESHOLD || 90),
          })
        );
        if (m.status !== 200) throw awsError(m.status, m.json, 'SearchFaces');
        const matches = m.json?.FaceMatches ?? [];
        if (matches.length === 0) {
          throw new FaceProviderError('VERIFICATION_FAILED', 'Yuz mos kelmadi');
        }
        return {
          status: 'VERIFIED',
          providerRef: String(matches[0]?.Face?.FaceId || state.p),
          livenessPassed: true,
          confidence,
        };
      }

      // Kadr kelmagan bo'lsa — tasdiqlamaymiz (fail-closed).
      throw new FaceProviderError('FACE_NOT_DETECTED', 'Kadr kelmadi');
    },

    async enrollFace(input: EnrollFaceInput): Promise<{ faceId: string }> {
      const cfg = awsConfig();
      if (!cfg) throw new FaceProviderError('NOT_CONFIGURED', 'AWS kalitlari yo‘q');
      if (!input.consentGiven) {
        throw new FaceProviderError('INVALID_REQUEST', 'Rozilik yo‘q');
      }
      if (!input.imageBytes?.length) {
        throw new FaceProviderError('FACE_NOT_DETECTED', 'Rasm yo‘q');
      }
      const res = await awsJson(
        cfg,
        'POST',
        '/',
        { Action: 'IndexFaces' },
        JSON.stringify({
          CollectionId: cfg.collectionId,
          Image: { Bytes: input.imageBytes.toString('base64') },
          ExternalImageId: input.userId,
          MaxFaces: 1,
          QualityFilter: 'AUTO',
        })
      );
      if (res.status !== 200) throw awsError(res.status, res.json, 'IndexFaces');
      const rec = res.json?.FaceRecords?.[0]?.Face;
      if (!rec?.FaceId) throw new FaceProviderError('FACE_NOT_DETECTED', 'Yuz topilmadi');
      return { faceId: String(rec.FaceId) };
    },

    async matchFace(input: MatchFaceInput): Promise<FaceMatchResult> {
      const cfg = awsConfig();
      if (!cfg) throw new FaceProviderError('NOT_CONFIGURED', 'AWS kalitlari yo‘q');
      if (!input.imageBytes?.length) throw new FaceProviderError('FACE_NOT_DETECTED', 'Rasm yo‘q');
      const res = await awsJson(
        cfg,
        'POST',
        '/',
        { Action: 'SearchFaces' },
        JSON.stringify({
          CollectionId: cfg.collectionId,
          FaceImage: { Bytes: input.imageBytes.toString('base64') },
          FaceMatchThreshold: Math.round((input.threshold ?? 0.9) * 100),
          MaxFaces: 1,
        })
      );
      if (res.status !== 200) throw awsError(res.status, res.json, 'SearchFaces');
      const matches = res.json?.FaceMatches ?? [];
      if (matches.length === 0) return { matched: false };
      return {
        matched: true,
        similarity: Number(matches[0]?.Similarity ?? 0) / 100,
        providerRef: String(matches[0]?.Face?.FaceId || ''),
      };
    },
  };
}