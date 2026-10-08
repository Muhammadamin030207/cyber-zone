'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, Loader2, AlertCircle, Eye, X, ShieldCheck, RefreshCw,
} from 'lucide-react';
import api, { getApiErrorMessage, humanizeMediaError, humanizeModelLoadError } from '@/lib/api';
import { toastSuccess } from '@/lib/toast';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';

const BLINK_TARGET = 3;
const BLINK_THRESHOLD = 0.5;
const BLINK_DEBOUNCE_MS = 350;
const NO_FACE_AFTER_MS = 4500;

/**
 * Holatlar — foydalanuvchiga ko'rsatiladigan ANIQ bosqichlar.
 * "Yuklanmoqda" umumiy holati yo'q: har bosqich o'z nomi bilan chiqadi.
 */
type Status =
  | 'preparing'   // Server sessiyasini ochmoqda
  | 'camera'      // Kameraga ruxsat kutilmoqda
  | 'loading'     // Yuz detektori modeli yuklanmoqda
  | 'detecting'   // Yuz izlanmoqda
  | 'scanning'    // Jonlilik tekshiruvi (ko'z pirpirash)
  | 'verifying'   // Server natijani tekshiradi
  | 'success'
  | 'error';

/** Server kodlarini aniq, inson tilidagi holatga aylantiradi. */
function faceServerMessage(code: unknown, fallback: string): string {
  switch (code) {
    case 'NOT_CONFIGURED':
      return 'Face Verification hozircha mavjud emas.';
    case 'PROVIDER_UNAVAILABLE':
      return 'Face tekshiruv serverida vaqtinchalik xatolik.';
    case 'SESSION_EXPIRED':
      return 'Tekshiruv sessiyasi tugagan. Qaytadan boshlang.';
    case 'SESSION_ALREADY_USED':
      return 'Tekshiruv allaqachon bajarilgan. Qayta boshlang.';
    case 'VERIFICATION_FAILED':
      return 'Yuz tasdiqlanmadi. Qayta urinib ko‘ring.';
    case 'FACE_NOT_DETECTED':
      return 'Yuz aniqlanmadi. Yaxshi yoritilgan joyda urinib ko‘ring.';
    case 'INVALID_REQUEST':
      return 'Tekshiruv so‘rovi noto‘g‘ri.';
    case 'RATE_LIMITED':
      return 'Juda ko‘p urinish. Biroz kutib, qayta urinib ko‘ring.';
    case 'FACE_CHECK_NOT_REQUIRED':
      return 'Bu bron uchun yuz tekshiruvi talab qilinmaydi.';
    default:
      return fallback;
  }
}

/** Axios xatosidan server `code` ni ajratib oladi. */
function extractServerCode(err: unknown): unknown {
  const e = err as { response?: { data?: { code?: unknown } } } | null;
  return e?.response?.data?.code;
}

/**
 * KAMERALI YUZ TEKSHIRUVI (liveness) — Cyber-ZONE.
 *
 * Oqim:
 *   1) `POST /api/bookings/:id/face-session` — server provider sessiyasini ochadi.
 *      Token mijozga beriladi; u o'zini "o'tgan" deb hisoblay OLMAYDI.
 *   2) Kamera + MediaPipe yuz detektori — jonlilik (ko'z pirpirash).
 *   3) `POST /api/bookings/:id/face-verified` — server PROVIDER NATIJASINI
 *      tekshiradi va faqat `VERIFIED` bo'lsa `faceVerifiedAt` yozadi.
 *
 * Xatolar: hech qachon "Internetni tekshirib" umumiy xabari chiqmaydi —
 * kamera ruxsati, model yuklanishi, provider va tarmoq alohida ajratiladi.
 */
export default function FaceCheck({
  open,
  bookingId,
  onVerified,
  onClose,
}: {
  open: boolean;
  bookingId: string;
  onVerified: () => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceRef = useRef<FaceLandmarker | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const sessionTokenRef = useRef<string>('');
  const startedAtRef = useRef(0);

  const [status, setStatus] = useState<Status>('preparing');
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [blinks, setBlinks] = useState(0);
  const [faceSeen, setFaceSeen] = useState(false);
  const [faceLost, setFaceLost] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [runKey, setRunKey] = useState(0);

  const blinkRef = useRef({ closed: false, lastClosedAt: 0 });
  const noFaceSinceRef = useRef(0);
  const blinksRef = useRef(0);
  const doneRef = useRef(false);

  const STATUS_TEXT: Record<Status, string> = {
    preparing: 'Tekshiruv sessiyasi tayyorlanmoqda',
    camera: 'Kameraga ruxsat kutilmoqda',
    loading: 'Yuzni aniqlash moduli yuklanmoqda',
    detecting: 'Yuz izlanmoqda',
    scanning: `Ko‘zingizni ${BLINK_TARGET} marta pirpirating`,
    verifying: 'Tekshirilmoqda',
    success: 'Tasdiqlandi',
    error: 'Tekshiruvni yakunlab bo‘lmadi',
  };

  const stopCamera = useCallback(async () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try { await faceRef.current?.close(); } catch { /* jimgina */ }
    faceRef.current = null;
  }, []);

  const fail = useCallback((title: string, technical?: string) => {
    setError(title);
    setErrorDetail(technical ?? null);
    setStatus('error');
    doneRef.current = false;
  }, []);

  /**
   * Kamerani ochish — mobil/shaxsiy brauzerlar uchun CHIDAMLI.
   *
   * Ba'zi Android Chrome / WebView tizimlari `ideal` cheklovli
   * `getUserMedia` so'rovini `NotSupportedError` yoki `OverconstrainedError`
   * bilan rad etadi ("Brauzer kamera tekshiruvini qo'llab-quvvatlamaydi" degan
   * YOLG'ON xabar shu sababli chiqardi). Bunday hollarda oddiy minimal
   * cheklovsiz `{ video: true }` so'rov bilan qayta urinamiz.
   */
  const openCamera = useCallback(async (): Promise<MediaStream> => {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) {
      throw new DOMException('mediaDevices mavjud emas', 'NotSupportedError');
    }
    try {
      return await md.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (err) {
      const name = (err as DOMException | null)?.name || '';
      if (['NotSupportedError', 'OverconstrainedError', 'AbortError', 'TypeError'].includes(name)) {
        return await md.getUserMedia({ video: true, audio: false });
      }
      throw err;
    }
  }, []);

  // ---- Boshlang'ich oqim: kamera (parallel) + server sessiyasi + model ----
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let pendingCam: MediaStream | null = null;

    (async () => {
      setStatus('preparing');
      setError(null);
      setErrorDetail(null);
      setBlinks(0);
      setFaceSeen(false);
      setFaceLost(false);
      setCameraError(false);
      blinksRef.current = 0;
      blinkRef.current = { closed: false, lastClosedAt: 0 };
      noFaceSinceRef.current = 0;
      doneRef.current = false;
      sessionTokenRef.current = '';
      startedAtRef.current = Date.now();

      // 1) KamerAGA RUXSATNI DARHOL so'raymiz (server bilan parallel).
      //    Sabab: server (Render) sovuq holatda 30-60s sekin javob berishi
      //    mumkin — o'sha vaqtda yorliq fon o'tsa, keyin keyin ochilgan
      //    `getUserMedia` Android Chrome'da `NotSupportedError` bilan rad
      //    etiladi. Shu orada so'rash orqali muammo yo'qoladi.
      const camErrHolder: { err: unknown } = { err: null };
      const camPromise = openCamera()
        .then((stream) => { if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return null; } return stream; })
        .catch((err: unknown) => { camErrHolder.err = err; return null; });

      // 2) Server sessiyasi. Provider yo'q bo'lsa — aniq `NOT_CONFIGURED`
      //    xabari chiqadi; kamera ochilsa ham yopiladi.
      try {
        const { data } = await api.post(`/api/bookings/${bookingId}/face-session`);
        if (cancelled) return;
        sessionTokenRef.current = String(data?.data?.sessionToken || '');
      } catch (err) {
        if (cancelled) return;
        pendingCam = await camPromise;
        if (pendingCam) pendingCam.getTracks().forEach((t) => t.stop());
        const code = extractServerCode(err);
        fail(faceServerMessage(code, 'Tekshiruvni boshlab bo‘lmadi.'), String(getApiErrorMessage(err)));
        return;
      }
      if (cancelled) return;

      // 3) Kamera natijasi
      setStatus('camera');
      const stream = await camPromise;
      if (cancelled) {
        if (stream) stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (camErrHolder.err) {
        const errName = (camErrHolder.err as DOMException | null)?.name || '';
        const incompatible = ['NotSupportedError', 'OverconstrainedError', 'TypeError'].includes(errName);
        setCameraError(!incompatible);
        fail(
          incompatible
            ? 'Bu brauzer kamera tekshiruvini qo‘llab-quvvatlamaydi.'
            : (humanizeMediaError(camErrHolder.err) ?? 'Kamerani ochib bo‘lmadi. Qurilma sozlamalarini tekshiring.'),
          `getUserMedia: ${errName || 'unknown'}`
        );
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus('loading');
    })();

    return () => {
      cancelled = true;
      pendingCam?.getTracks().forEach((t) => t.stop());
      void stopCamera();
    };
  }, [open, bookingId, runKey, fail, stopCamera, openCamera]);

  // ---- Yuz detektori modelini yuklash ----
  useEffect(() => {
    if (status !== 'loading') return;
    let cancelled = false;
    (async () => {
      try {
        const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
        const wasm = await FilesetResolver.forVisionTasks('/wasm');
        const opts = {
          baseOptions: { modelAssetPath: '/models/face_landmarker.task' },
          runningMode: 'VIDEO' as const,
          numFaces: 1,
          outputFaceBlendshapes: true,
        };
        let landmarker: FaceLandmarker | null = null;
        // Avval GPU, GPU ishlamasa CPU (ba'zi qurilmalarda GPU delegate xato beradi).
        try {
          landmarker = await FaceLandmarker.createFromOptions(wasm, {
            ...opts, baseOptions: { ...opts.baseOptions, delegate: 'GPU' },
          });
        } catch {
          landmarker = await FaceLandmarker.createFromOptions(wasm, {
            ...opts, baseOptions: { ...opts.baseOptions, delegate: 'CPU' },
          });
        }
        if (cancelled) { await landmarker.close(); return; }
        faceRef.current = landmarker;
        setStatus('detecting');
      } catch (err) {
        if (cancelled) return;
        fail(
          humanizeModelLoadError(err) ?? 'Yuzni aniqlash moduli yuklanmadi. Sahifani yangilang.',
          `mediapipe: ${(err as Error)?.message?.slice(0, 120) || 'unknown'}`
        );
      }
    })();
    return () => { cancelled = true; };
  }, [status, fail]);

  // ---- 2-bosqich: server natijani tasdiqlaydi ----
  const submitVerified = useCallback(async () => {
    setStatus('verifying');
    const durationMs = Date.now() - startedAtRef.current;
    try {
      await api.post(`/api/bookings/${bookingId}/face-verified`, {
        sessionToken: sessionTokenRef.current,
        clientDurationMs: durationMs,
      });
      setStatus('success');
      toastSuccess('Yuz tekshiruvi o‘tkazildi — sessiyani boshlang');
      onVerified();
    } catch (err) {
      const code = extractServerCode(err);
      fail(faceServerMessage(code, 'Tekshiruvni saqlab bo‘lmadi.'), String(getApiErrorMessage(err)));
    }
  }, [bookingId, fail, onVerified]);

  // ---- Jonli sikl: detektsiya + blink sanog'i ----
  useEffect(() => {
    if (!open || status !== 'scanning' || !videoRef.current) return;
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      const lm = faceRef.current;
      if (
        video && lm && video.readyState >= 2 &&
        video.currentTime !== lastVideoTimeRef.current && !doneRef.current
      ) {
        lastVideoTimeRef.current = video.currentTime;
        try {
          const raw = lm.detectForVideo(video, performance.now());
          const shapes = raw.faceBlendshapes?.[0];
          if (shapes) {
            setFaceSeen(true);
            setFaceLost(false);
            noFaceSinceRef.current = 0;
            const l = shapes.categories?.find((c) => c.categoryName === 'eyeBlinkLeft')?.score ?? 0;
            const r = shapes.categories?.find((c) => c.categoryName === 'eyeBlinkRight')?.score ?? 0;
            const closed = (l + r) / 2 > BLINK_THRESHOLD;
            const st = blinkRef.current;
            const now = performance.now();
            if (closed && !st.closed) {
              st.closed = true;
              st.lastClosedAt = now;
            } else if (!closed && st.closed && now - st.lastClosedAt < BLINK_DEBOUNCE_MS) {
              st.closed = false;
              blinksRef.current += 1;
              setBlinks(blinksRef.current);
              if (blinksRef.current >= BLINK_TARGET) {
                doneRef.current = true;
                void submitVerified();
              }
            } else if (!closed && st.closed) {
              st.closed = false;
            }
          } else {
            if (noFaceSinceRef.current === 0) {
              noFaceSinceRef.current = performance.now();
            } else if (performance.now() - noFaceSinceRef.current > NO_FACE_AFTER_MS) {
              setFaceSeen(false);
              setFaceLost(true);
              noFaceSinceRef.current = 0;
            }
          }
        } catch (err) {
          // Detektor ishlashdan to'xtadi — jimgina qolmaslik uchun aniq xabar.
          doneRef.current = true;
          fail('Yuzni aniqlash to‘xtadi. Qayta urinib ko‘ring.', `detect: ${(err as Error)?.message?.slice(0, 120)}`);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, status, submitVerified, fail]);

  if (!open) return null;

  const progress = Math.min(100, Math.round((blinks / BLINK_TARGET) * 100));
  const close = () => { void stopCamera(); onClose(); };
  const retry = () => { void stopCamera(); setRunKey((k) => k + 1); };

  const showVideo = ['detecting', 'scanning', 'verifying', 'success'].includes(status);
  const busy = status === 'preparing' || status === 'camera' || status === 'loading';

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/85 sm:p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Face Verification — yuz tekshiruvi"
        className="cz-card w-full sm:max-w-lg !rounded-t-2xl sm:!rounded-2xl overflow-hidden"
      >
        {/* Sarlavha */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-[var(--line)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="cz-icon-btn !w-7 !h-7 !min-w-7 text-[var(--acc-a)]" aria-hidden>
              <ShieldCheck size={15} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--acc-a)] truncate">
                Face Verification
              </p>
              <p className="text-[13px] font-semibold text-[var(--fg)] truncate">Yuz tekshiruvi</p>
            </div>
          </div>
          <button onClick={close} disabled={status === 'verifying'} aria-label="Yopish"
            className="cz-icon-btn shrink-0 disabled:opacity-40">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 sm:p-5">
          {/* XATO HOLATI */}
          {status === 'error' && (
            <div className="flex flex-col items-center text-center gap-3 py-6" role="alert">
              <AlertCircle size={30} className="text-[var(--danger)]" aria-hidden />
              <p className="text-sm font-semibold text-[var(--fg)] max-w-xs">{error}</p>
              {errorDetail && (
                <details className="w-full max-w-xs text-left">
                  <summary className="text-[11px] text-[var(--fg-dim)] cursor-pointer select-none">
                    Texnik ma’lumot
                  </summary>
                  <code className="mt-1 block break-all text-[10px] text-[var(--fg-dim)] bg-black/40 rounded p-2">
                    {errorDetail}
                  </code>
                </details>
              )}
              <button onClick={retry} className="cz-btn cz-btn--secondary">
                <RefreshCw size={14} /> Qayta urinish
              </button>
            </div>
          )}

          {/* VIDEO / KAMERA */}
          {showVideo || busy ? (
            <>
              <div className="relative overflow-hidden rounded-xl bg-black border border-[var(--line)]">
                <div className="relative w-full aspect-[4/3] sm:aspect-[16/10]">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    aria-label="Kamera tasviri"
                    className={`absolute inset-0 h-full w-full object-cover -scale-x-100 transition-opacity duration-300 ${
                      showVideo ? 'opacity-100' : 'opacity-0'
                    }`}
                  />

                  {/* Markaziy doira */}
                  {showVideo && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div
                        className={`aspect-square h-[68%] max-h-full rounded-full border-2 transition-all duration-300 ${
                          status === 'success'
                            ? 'border-[var(--ok)] scale-100'
                            : faceSeen && !faceLost
                              ? 'border-[var(--acc-a)] scale-95'
                              : 'border-white/25 scale-105'
                        }`}
                        style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.42)' }}
                      />
                    </div>
                  )}

                  {/* Yuklanish holati */}
                  {busy && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/70">
                      <Loader2 size={26} className="animate-spin text-[var(--acc-a)]" aria-hidden />
                      <p className="text-[13px] text-[var(--fg-mut)] text-center px-6">{STATUS_TEXT[status]}</p>
                    </div>
                  )}

                  {/* Yuz topilmadi */}
                  {status === 'scanning' && !faceSeen && (
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-black/70 px-3 py-2">
                      <p className="text-[12px] text-[var(--fg-mut)] text-center">
                        {faceLost ? 'Yuz kadrdan chiqdi — doiraga qaytiring' : 'Yuzni doiraga joylashtiring'}
                      </p>
                    </div>
                  )}

                  {/* Tasdiqlandi */}
                  {status === 'success' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70">
                      <CheckCircle2 size={34} className="text-[var(--ok)]" aria-hidden />
                      <p className="text-sm font-bold text-[var(--fg)]">Tasdiqlandi</p>
                    </div>
                  )}

                  {/* Server tekshiruvi */}
                  {status === 'verifying' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/75">
                      <Loader2 size={26} className="animate-spin text-[var(--acc-a)]" aria-hidden />
                      <p className="text-[13px] text-[var(--fg-mut)]">Tekshirilmoqda</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Kamera ruxsati xabari */}
              {cameraError && status === 'error' && (
                <p className="mt-3 text-[12px] text-[var(--danger)]">
                  Kameraga ruxsat berish uchun brauzer manzilbaridagi kamera belgisini bosing.
                </p>
              )}

              {/* Holat qatori */}
              {status !== 'success' && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-[12px] text-[var(--fg-mut)]">
                      <Eye size={13} className="text-[var(--acc-b)]" aria-hidden />
                      Ko‘z pirpirash
                      <b className="font-mono text-[var(--acc-b)]">{blinks}/{BLINK_TARGET}</b>
                    </span>
                    <div
                      className="h-1.5 w-28 rounded-full bg-white/10 overflow-hidden"
                      role="progressbar"
                      aria-valuenow={blinks}
                      aria-valuemin={0}
                      aria-valuemax={BLINK_TARGET}
                      aria-label="Ko‘z pirpirash progressi"
                    >
                      <div className="h-full bg-[var(--acc-a)] transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <p className="text-[12px] text-[var(--fg-dim)] leading-relaxed">
                    {STATUS_TEXT[status]}
                    {status === 'detecting' && ' — yuz to‘liq ko‘rinishi kerak.'}
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Tugmalar */}
        {status !== 'success' && (
          <div className="px-4 sm:px-5 py-3 border-t border-[var(--line)] flex justify-end gap-2">
            <button onClick={close} disabled={status === 'verifying'} className="cz-btn cz-btn--secondary">
              Bekor qilish
            </button>
          </div>
        )}
      </div>
    </div>
  );
}