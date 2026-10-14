# Cyber-ZONE — Face Authentication: ikki xil oqim (ALOHIDA)

> Muhim: saytda **ikki butunlay boshqacha** "yuz" texnologiyasi bor.
> Ularni aralashtirish noto'g'ri xulosaga olib keladi.

---

## 1) WebAuthn / Passkey — LOGIN (parolsiz kirish)

**Xaqiqiy maqsadi:** tizimga kirish (autentifikatsiya).
**Kamera liveness YO'Q** — bu platforma authenticator (Face ID / Touch ID /
Windows Hello / Android biometriya) yoki security key orqali kriptografik
imzo tekshiruvi.

### Oqim (backend: `src/controllers/webauthn.controller.ts`)

1. **Register (passkey qo'shish)** — `POST /api/webauthn/register/options`
   → `generateRegistrationOptions` → challenge **serverda** saqlanadi
   (Redis, bir martalik GETDEL, TTL 5 daqiqa).
2. `startRegistration` (brauzer) → `POST /api/webauthn/register/verify`
   → `verifyRegistrationResponse` (expectedChallenge, expectedOrigin,
   expectedRPID) → `Passkey` yozuvi (`publicKey`, `counter`, `userId`).
3. **Login options** — `POST /api/webauthn/auth/options`:
   - email kiritilsa → `allowCredentials` to'ldiriladi (aniq passkey);
   - email bo'sh bo'lsa → discoverable (spec §20), allowCredentials = [] .
   Challenge yana serverda bir martalik saqlanadi.
4. **Signature verify** — `POST /api/webauthn/auth/verify`:
   - challenge bir martalik (replay rad etiladi);
   - `expectedOrigin` / `expectedRPID` challenge yaratilgan paytdagi
     domenga qulflangan (`requestRp` allowlist, satr 42-58);
   - credential **egaligi**: passkey topiladi, `passkey.userId` va
     `userHandle` tekshiriladi (mijoz ishonilmaydi);
   - `counter` oshishi tekshiriladi (clonlash belgisi);
   - **session**: `generateTokens` (access + refresh), 2FA talab
     qilinsa `pendingLoginToken` orqali bosqichma-bosqich.
5. **HTTPS majburiy** (WebAuthn spec talabi) — production'da HTTPS.

### Frontend
- `src/lib/webauthn.ts` — `passwordlessLogin`, `biometricLogin`,
  `finishPasskeyLogin`, `addPasskey`.
- Login sahifasi: "Face ID bilan kirish" tugmasi → shu WebAuthn oqimi
  (`src/app/[locale]/login/page.tsx`).
- Xatolar alohida tasvirlanadi (`describeWebAuthnError`):
  bekor qilindi / qurilma qo'llamaydi / ruxsat rad etildi /
  domen (RP ID) noto'g'ri / server xatosi — hamma bir xil emas.

### Xavfsizlik cheklovlari (saqlangan)
challenge bir martalik + 5 min TTL, origin/RP ID qulfli, credential
egaligi serverda, counter, tokenVersion (logout butun sessiyani bekor qiladi).

---

## 2) Camera Face-Liveness — BRON SESSIYASI GATE (check-in oldin)

**Xaqiqiy maqsadi:** sessiya boshlanishida "jonli odam" tekshiruvi.
**Bu WebAuthn EMAS** — kamera + MediaPipe blink (3 ko'z pirpiratish).

### Frontend (`src/components/booking/FaceCheck.tsx`)
1. `POST /api/bookings/:id/face-session` → server sessiya yaratadi yoki
   aniq xato qaytaradi.
2. Kamera + MediaPipe bilan blink hujjatlashtiriladi (minimal 6 soniya).
3. Yuz kadrlari → `POST /api/bookings/:id/face-verified`.
4. `verified=true` klienti **ishonilmaydi** — faqat server hukmi.

### Backend (`booking.controller.ts` + `services/face/`)
- `facePrecheck` / `startFaceSession` / `markFaceVerified` (≈ satr 885/919/963).
- Provider reestri **fail-closed**: `services/face/registry.ts` (satr 23).
  `FACE_PROVIDER` bo'sh/`none` → `none` provider → `NOT_CONFIGURED` (503).
- AWS Rekognition (`services/face/providers/aws.ts`): liveness + 1:1 match,
  Redis GETDEL orqali sessiya replay himoyasi.
- `markFaceVerified` faqat server natijasiga ishonadi — hech qanday
  client bayrog'i (`verified=true`) qabul qilinmaydi.
- Xato kodlari/statuslari: `services/face/types.ts`
  (`NOT_CONFIGURED` 503, `PROVIDER_UNAVAILABLE` 502, `VERIFICATION_FAILED`
  422, `SESSION_EXPIRED` 410, `RATE_LIMITED` 429 ...).

### NOT_CONFIGURED holati (production holati, 2026-10-14 tekshirildi)
- `render.yaml`da `FACE_PROVIDER` / `AWS_*` kalitlari yo'q → production'da
  oqim doimiy `NOT_CONFIGURED` qaytaradi.
- Frontend buni ochiq ko'rsatadi va sessiya **bloklanmaydi**
  (fail-open enforcement, ataylab shunday: `SessionController.tsx` ≈ satr 93-101).
- Hech qanday soxta `verified` yaratilmaydi.

### Kerakli konfiguratsiya (qiymatlarini REPOGA YOZMAYMIZ — faqat nomlar)
Render dashboard (keyingi deploy'da qo'llanadi):
- `FACE_PROVIDER=aws`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_FACE_COLLECTION_ID`
- Redis (AWS sessiya/replay uchun) — `REDIS_URL` (mavjud)

---

## Tez diagnostika

| Savol | Javob beradigan endpoint |
|---|---|
| Passkey ishlaydimi? | `POST /api/webauthn/auth/options` (200/400) |
| Face provider sozlanganmi? | `POST /api/bookings/:id/face-session` → `code: NOT_CONFIGURED` |
| AI kaliti bormi? | `GET /api/ai/status` (kalit qiymatlari qaymaydi) |
