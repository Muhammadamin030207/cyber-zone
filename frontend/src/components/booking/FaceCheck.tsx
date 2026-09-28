'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Loader2, AlertCircle, Eye, X } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { toastError, toastSuccess } from '@/lib/toast';
import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

const BLINK_TARGET = 3;
const BLINK_THRESHOLD = 0.5;
const BLINK_DEBOUNCE_MS = 350;
const NO_FACE_AFTER_MS = 4500;

type Status =
  | 'booting'
  | 'camera'
  | 'detecting'
  | 'scanning'
  | 'passing'
  | 'uploading'
  | 'error';

/**
 * KAMERALI YUZ TEKSHIRUVI (liveness).
 *
 * MediaPipe FaceLandmarker bilan yuzni topamiz va "ko'z pirpirash" (blink)
 * orqali jonlilikni tekshiramiz:
 *   1) kamerani so'raymiz + video ko'rsatamiz (mijoz yuzini ko'radi),
 *   2) FaceLandmarker blend-shape'lari `eyeBlinkLeft`/`eyeBlinkRight` > 0.5
 *      — ko'z yumilgan;
 *   3) ochiq-yumig-yochiq holat 3 marta takrorlansa — LIVENESS o'tdi;
 *   4) `POST /api/bookings/:id/face-verified` — server tegishini yozadi.
 *
 * Bu – STATIK RASM/DONA videoni o'z-o'zidan yo'q qiladigan jonli tekshiruv:
 * "ko'z pirpirating" buyrug'i BERSIZ kamerada bajarilishi shart (hech qanday
 * rasm 3 marta pirpira olmaydi). Eslatma: bu to'liq biometrik identifikatsiya
 * EMAS — "mijozning o'zi jonli ekani"ni isbotlaydi.
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
  const animRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1);

  const [status, setStatus] = useState<Status>('booting');
  const [message, setMessage] = useState('');
  const [blinks, setBlinks] = useState(0);
  const [faceSeen, setFaceSeen] = useState(false);
  const [stillFrame, setStillFrame] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Blink holati — ref'da ushlab turamiz (animatsiya sikli render'ga bog'lanmaydi).
  const blinkStateRef = useRef<{ closed: boolean; lastClosedAt: number }>({ closed: false, lastClosedAt: 0 });
  const noFaceSinceRef = useRef<number>(0);
  const doneRef = useRef(false);

  async function stopCamera() {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try { await faceRef.current?.close(); } catch { /* jimgina */ }
    faceRef.current = null;
  }

  // Dastlabki qadam: kamerani ochamiz
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setStatus('booting');
      setMessage('Kamera sozlanmoqda…');
      setError(null);
      setBlinks(0);
      setFaceSeen(false);
      setStillFrame(false);
      blinkStateRef.current = { closed: false, lastClosedAt: 0 };
      noFaceSinceRef.current = 0;
      doneRef.current = false;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setStatus('detecting');
        setMessage('Yuzni kameraga qadang');
      } catch (err) {
        setError((err as Error)?.name === 'NotAllowedError'
          ? 'Kameraga ruxsat berilmadi — brauzer sozlamalarida ruxsat bering.'
          : (err as Error)?.name === 'NotFoundError'
            ? 'Kamera topilmadi.'
            : getApiErrorMessage(err, 'Kamerani ochib bo\'lmadi'));
        setStatus('error');
      }
    })();
    return () => { cancelled = true; void stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bookingId]);

  // FaceLandmarker'ni yuklaymiz (ilgari yuklanmagan bo'lsa)
  useEffect(() => {
    if (status !== 'detecting' && status !== 'scanning') return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@mediapipe/tasks-vision');
        const { FilesetResolver, FaceLandmarker } = mod;
        const wasm = await FilesetResolver.forVisionTasks('/wasm');
        let landmarker: FaceLandmarker | null = null;
        try {
          landmarker = await FaceLandmarker.createFromOptions(wasm, {
            baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'GPU' },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: true,
          });
        } catch {
          landmarker = await FaceLandmarker.createFromOptions(wasm, {
            baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'CPU' },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: true,
          });
        }
        if (cancelled) { await landmarker.close(); return; }
        faceRef.current = landmarker;
        setStatus('scanning');
        setMessage(`Ko'zingizni ${BLINK_TARGET} marta pirpirating`);
      } catch (err) {
        setError(getApiErrorMessage(err, 'Yuz detektori yuklanmadi'));
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function submitVerified() {
    setStatus('uploading');
    try {
      await api.post(`/api/bookings/${bookingId}/face-verified`);
      toastSuccess('Yuz tekshiruvi o\'tkazildi — sessiyani boshlang');
      setStatus('passing');
      onVerified();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Tekshiruvni saqlab bo\'lmadi'));
      setStatus('error');
      doneRef.current = false;
    }
  }

  // Jonli sikl: har kadrda detektsiya + blink sanog'i
  useEffect(() => {
    if (!open || status !== 'scanning' || !videoRef.current) return;
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      const lm = faceRef.current;
      if (video && lm && video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current && !doneRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        const raw = lm.detectForVideo(video, performance.now());
        // FaceLandmarkerResult ko'p maydonli — faqat blendshapes'ni o'qiymiz.
        const blendshapes = raw.faceBlendshapes?.[0];
        if (blendshapes) {
          if (!faceSeen) setFaceSeen(true);
          noFaceSinceRef.current = 0;
          const blinkL = blendshapes.categories?.find((c) => c.categoryName === 'eyeBlinkLeft')?.score ?? 0;
          const blinkR = blendshapes.categories?.find((c) => c.categoryName === 'eyeBlinkRight')?.score ?? 0;
          const closed = (blinkL + blinkR) / 2 > BLINK_THRESHOLD;
          const st = blinkStateRef.current;
          const now = performance.now();
          if (closed && !st.closed) {
            st.closed = true;
            st.lastClosedAt = now;
          } else if (!closed && st.closed && now - st.lastClosedAt < BLINK_DEBOUNCE_MS) {
            // Yumdi-yochdi — bitta to'liq pirpirash
            st.closed = false;
            const next = blinks + 1;
            setBlinks(next);
            if (next >= BLINK_TARGET) {
              doneRef.current = true;
              setStatus('passing');
              setMessage('Liveness o\'tdi — saqlanmoqda…');
              void submitVerified();
            }
          } else if (!closed && st.closed) {
            st.closed = false;
          }
        } else {
          // Yuz yo'qolgan — timer vaqt o'tsa ogohlantiramiz
          if (noFaceSinceRef.current === 0) noFaceSinceRef.current = performance.now();
          else if (performance.now() - noFaceSinceRef.current > NO_FACE_AFTER_MS) {
            setFaceSeen(false);
            noFaceSinceRef.current = 0;
            setStillFrame(true);
            setMessage('Yuz topilmadi — kameraga qadang');
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status, faceSeen]);

  if (!open) return null;

  const progress = Math.min(100, Math.round((blinks / BLINK_TARGET) * 100));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="neo-card rounded-2xl max-w-md w-full overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-cyber-700">
          <p className="font-bold flex items-center gap-2 text-sm">
            <Camera size={16} className="text-neon-cyan" />
            Yuz tekshiruvi
          </p>
          <button onClick={() => { void stopCamera(); onClose(); }} className="text-gray-400 hover:text-gray-200" aria-label="Yopish">
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          {status === 'booting' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={30} className="animate-spin text-neon-cyan" />
              <p className="text-sm text-gray-300">{message}</p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertCircle size={30} className="text-red-400" />
              <p className="text-sm text-gray-300">{error}</p>
              <button onClick={onClose} className="text-xs px-4 py-2 rounded-lg border border-cyber-600 text-gray-300 hover:border-neon-cyan transition-colors">
                Yopish
              </button>
            </div>
          )}

          {(status === 'detecting' || status === 'scanning' || status === 'passing' || status === 'uploading') && (
            <>
              <div className="relative rounded-xl overflow-hidden bg-black border border-cyber-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full aspect-[4/3] object-cover -scale-x-100"
                />
                {status === 'detecting' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <p className="text-sm text-gray-200 flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      {message}
                    </p>
                  </div>
                )}
                {status === 'passing' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-neon-green/10">
                    <p className="text-sm font-bold text-neon-green flex items-center gap-2">
                      <CheckCircle2 size={18} />
                      Liveness o&apos;tdi
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Eye size={14} className="text-neon-cyan" />
                  <span>Ko&apos;z pirpirash: <b className="text-neon-cyan">{blinks}/{BLINK_TARGET}</b></span>
                </div>
                <div className="w-32 h-1.5 rounded-full bg-cyber-800 overflow-hidden">
                  <div className="h-full bg-neon-cyan transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>

              <p className="text-[11px] text-gray-500 mt-2">
                {status === 'scanning' && (faceSeen ? message : 'Yuz topilmoqda…')}
                {status === 'passing' || status === 'uploading' ? message : ''}
              </p>

              {stillFrame && (
                <p className="text-[11px] text-neon-amber mt-1">
                  Eslatma: bu tekshiruv jonli — rasm/video bilan o&apos;tib bo&apos;lmaydi.
                </p>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-cyber-700 flex justify-end">
          <button
            onClick={() => { void stopCamera(); onClose(); }}
            disabled={status === 'uploading'}
            className="text-xs px-4 py-2 rounded-lg border border-cyber-600 text-gray-300 hover:border-neon-cyan transition-colors disabled:opacity-50"
          >
            Bekor qilish
          </button>
        </div>
      </div>
    </div>
  );
}