// ============================================================================
// AI LOG SANITIZATSIYASI
// ============================================================================
// Provider xatolari (fetch error, HTTP javob matni) logga yozilishdan OLDIN
// shu funksiya orqali o'tkaziladi: API key, Bearer token va provider kalit
// oilalari (AIza..., sk-ant..., sk-...) hech qachon logga tushmasligi kerak.
// Foydalanuvchi xabari EMAS — faqat server konsoli uchun.
// ============================================================================

const SECRET_PATTERNS: RegExp[] = [
  // URL query kaliti: ?key=ABC / &key=ABC (Gemini shu formatda)
  /([?&]key=)[^&\s"']+/gi,
  // Authorization header qiymati
  /(bearer\s+)[A-Za-z0-9._\-]+/gi,
  // Google API kalitlari
  /\bAIza[A-Za-z0-9_\-]{8,}/g,
  // Anthropic kalitlari
  /\bsk-ant-[A-Za-z0-9_\-]{8,}/g,
  // OpenAI va o'xshash kalitlar
  /\bsk-[A-Za-z0-9_\-]{8,}/g,
];

/** Log matnidan kalit/token izlarini olib tashlaydi va uzunlikni cheklaydi. */
export function sanitizeAiLog(text: unknown, maxLen = 200): string {
  let s = typeof text === 'string' ? text : String(text ?? '');
  for (const re of SECRET_PATTERNS) s = s.replace(re, '$1***');
  return s.slice(0, maxLen);
}
