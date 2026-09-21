import { sendEmail } from './mailer';
import { config } from '../config';
import prisma from './prisma';

/**
 * Xavfsizlik ogohlantirishlari (email).
 *
 * Har bir muhim hisob hodisasi (bloklanish, yangi qurilma, parol o'zgarishi,
 * 2FA yoqilishi/o'chirilishi, passkey qo'shilishi/o'chirilishi) haqida
 * foydalanuvchiga email yuboriladi. Bu "non-blocking": yuborishdagi xatolik
 * asosiy amalni buzmaydi, faqat logga yoziladi.
 */

export type SecurityEventType =
  | 'ACCOUNT_LOCKED'
  | 'SUSPICIOUS_LOGIN'
  | 'NEW_DEVICE_LOGIN'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET'
  | 'TWO_FACTOR_ENABLED'
  | 'TWO_FACTOR_DISABLED'
  | 'PASSKEY_ADDED'
  | 'PASSKEY_REMOVED'
  | 'EMAIL_CHANGED';

interface EventMeta {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  actionHint: string;
}

const EVENTS: Record<SecurityEventType, EventMeta> = {
  ACCOUNT_LOCKED: {
    title: 'Hisob vaqtincha bloklandi',
    message: 'Hisobingizga ketma-ket bir necha marta noto\'g\'ri parol kiritilgani sababli vaqtincha bloklandi.',
    severity: 'critical',
    actionHint: 'Agar bu siz bo\'lmasangiz, darhol parolingizni tiklang va ikki faktorli autentifikatsiyani yoqing.',
  },
  SUSPICIOUS_LOGIN: {
    title: 'Shubhali kirish urinishi',
    message: 'Hisobingizga shubhali joydan yoki qurilmadan kirish aniqlandi.',
    severity: 'critical',
    actionHint: 'Agar bu siz bo\'lmasangiz, darhol parolingizni o\'zgartiring.',
  },
  NEW_DEVICE_LOGIN: {
    title: 'Yangi qurilmadan kirish',
    message: 'Hisobingizga yangi qurilma yoki brauzerdan muvaffaqiyatli kirdingiz.',
    severity: 'warning',
    actionHint: 'Agar bu siz bo\'lmasangiz, darhol parolingizni o\'zgartiring va barcha sessiyalarni yakunlang.',
  },
  PASSWORD_CHANGED: {
    title: 'Parol o\'zgartirildi',
    message: 'Hisobingiz paroli muvaffaqiyatli o\'zgartirildi.',
    severity: 'warning',
    actionHint: 'Agar bu siz bo\'lmasangiz, darhol parolni tiklang.',
  },
  PASSWORD_RESET: {
    title: 'Parol tiklandi',
    message: 'Hisobingiz paroli tiklash orqali yangilandi.',
    severity: 'warning',
    actionHint: 'Agar bu siz bo\'lmasangiz, darhol qo\'llab-quvvatlash xizmatiga murojaat qiling.',
  },
  TWO_FACTOR_ENABLED: {
    title: 'Ikki faktorli himoya yoqildi',
    message: 'Hisobingizda ikki faktorli autentifikatsiya (2FA) yoqildi.',
    severity: 'info',
    actionHint: 'Tiklash kodlaringizni xavfsiz joyda saqlang.',
  },
  TWO_FACTOR_DISABLED: {
    title: 'Ikki faktorli himoya o\'chirildi',
    message: 'Hisobingizda ikki faktorli autentifikatsiya (2FA) o\'chirildi.',
    severity: 'critical',
    actionHint: 'Agar bu siz bo\'lmasangiz, darhol 2FA ni qayta yoqing va parolni o\'zgartiring.',
  },
  PASSKEY_ADDED: {
    title: 'Yangi passkey qo\'shildi',
    message: 'Hisobingizga yangi passkey (Face ID / barmoq izi / xavfsizlik kaliti) qo\'shildi.',
    severity: 'info',
    actionHint: 'Agar bu siz bo\'lmasangiz, passkeyni o\'chiring va parolni o\'zgartiring.',
  },
  PASSKEY_REMOVED: {
    title: 'Passkey o\'chirildi',
    message: 'Hisobingizdan passkey o\'chirildi.',
    severity: 'warning',
    actionHint: 'Agar bu siz bo\'lmasangiz, darhol parolni o\'zgartiring.',
  },
  EMAIL_CHANGED: {
    title: 'Email manzili o\'zgartirildi',
    message: 'Hisobingiz email manzili o\'zgartirildi.',
    severity: 'critical',
    actionHint: 'Agar bu siz bo\'lmasangiz, darhol qo\'llab-quvvatlash xizmatiga murojaat qiling.',
  },
};

interface AlertContext {
  ip?: string | null;
  userAgent?: string | null;
  when?: Date;
  device?: string | null;
}

function severityStyles(severity: EventMeta['severity']): { accent: string; badge: string; badgeText: string } {
  switch (severity) {
    case 'critical':
      return { accent: '#ff2d55', badge: '#3a0d18', badgeText: '#ff8098' };
    case 'warning':
      return { accent: '#ffb020', badge: '#3a2a08', badgeText: '#ffd066' };
    default:
      return { accent: '#00d4ff', badge: '#082a3a', badgeText: '#6fe0ff' };
  }
}

function buildHtml(type: SecurityEventType, fullName: string, ctx: AlertContext): string {
  const meta = EVENTS[type];
  const s = severityStyles(meta.severity);
  const when = (ctx.when || new Date()).toLocaleString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const ip = ctx.ip || 'noma\'lum';
  const device = ctx.device || ctx.userAgent || 'noma\'lum';
  const rows = `
    <tr><td style="padding:6px 0;font-size:13px;color:#8f9cb3;width:120px;">Vaqt</td><td style="padding:6px 0;font-size:13px;color:#e6edf7;">${when}</td></tr>
    <tr><td style="padding:6px 0;font-size:13px;color:#8f9cb3;">IP manzil</td><td style="padding:6px 0;font-size:13px;color:#e6edf7;">${ip}</td></tr>
    <tr><td style="padding:6px 0;font-size:13px;color:#8f9cb3;">Qurilma</td><td style="padding:6px 0;font-size:13px;color:#e6edf7;word-break:break-word;">${device}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="uz" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<title>Cyber-ZONE — ${meta.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#070b16;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#e6edf7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#070b16;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding-bottom:20px;">
          <span style="font-size:22px;font-weight:800;letter-spacing:1px;color:#00d4ff;">🎮&nbsp;CYBER-ZONE</span>
        </td></tr>
        <tr><td style="background:linear-gradient(160deg,#0d1428 0%,#101a35 60%,#141032 100%);border:1px solid #1c2a4a;border-radius:18px;overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="height:4px;background:${s.accent};"></td></tr>
            <tr><td style="padding:28px 24px;">
              <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${s.badge};color:${s.badgeText};font-size:11px;font-weight:700;letter-spacing:0.5px;">XAVFSIZLIK OGOHLANTIRISHI</span>
              <h1 style="margin:14px 0 6px;font-size:22px;font-weight:800;color:${s.accent};">${meta.title}</h1>
              <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#aab6cc;">
                Salom, <b style="color:#e6edf7;">${fullName || 'foydalanuvchi'}</b>. ${meta.message}
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a101f;border:1px solid #1c2a4a;border-radius:12px;margin:0 0 16px;">
                <tr><td style="padding:12px 16px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
                </td></tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${s.badge};border-radius:12px;margin:0 0 16px;">
                <tr><td style="padding:12px 16px;">
                  <p style="margin:0;font-size:13px;color:${s.badgeText};">🛡️ <b>Nima qilish kerak:</b> ${meta.actionHint}</p>
                </td></tr>
              </table>
              <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7896">
                Cyber-ZONE hech qachon parolingizni yoki to'lov ma'lumotlaringizni so'ramaydi.
              </p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding-top:18px;">
          <p style="margin:0;font-size:11px;color:#47536e;line-height:1.6;">
            Cyber-ZONE — kompyuter xonalar SaaS platformasi<br />Bu xat avtomatik yuborildi, unga javob bermang.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildText(type: SecurityEventType, fullName: string, ctx: AlertContext): string {
  const meta = EVENTS[type];
  const when = (ctx.when || new Date()).toLocaleString('uz-UZ');
  return `Cyber-ZONE — ${meta.title}

Salom, ${fullName || 'foydalanuvchi'}.
${meta.message}

Vaqt: ${when}
IP manzil: ${ctx.ip || "noma'lum"}
Qurilma: ${ctx.device || ctx.userAgent || "noma'lum"}

${meta.actionHint}

Agar bu siz bo'lmasangiz, darhol hisob xavfsizligini tekshiring.
--- Cyber-ZONE`;
}

/** Emailda ko'rinadigan qurilma nomi (user-agent'ni odam o'qiydigan ko'rinishga). */
export function describeUserAgent(ua?: string | null): string {
  if (!ua) return 'Noma\'lum qurilma';
  const s = ua.toLowerCase();
  const os = /iphone|ipad|ipod/.test(s)
    ? 'iOS'
    : /android/.test(s)
      ? 'Android'
      : /windows/.test(s)
        ? 'Windows'
        : /mac os|macintosh/.test(s)
          ? 'macOS'
          : /linux/.test(s)
            ? 'Linux'
            : 'Noma\'lum OS';
  const browser = /edg\//.test(s)
    ? 'Edge'
    : /chrome\//.test(s) && !/chromium/.test(s)
      ? 'Chrome'
      : /firefox\//.test(s)
        ? 'Firefox'
        : /safari\//.test(s) && !/chrome/.test(s)
          ? 'Safari'
          : 'Brauzer';
  return `${browser} · ${os}`;
}

/**
 * Xavfsizlik ogohlantirishini yuboradi. Hech qachon throw qilmaydi — xatolik
 * faqat logga yoziladi (asosiy auth amali buzilmaydi).
 */
export async function sendSecurityAlert(
  to: string,
  fullName: string,
  type: SecurityEventType,
  ctx: AlertContext = {}
): Promise<void> {
  try {
    const meta = EVENTS[type];
    await sendEmail(to, `Cyber-ZONE — ${meta.title}`, buildHtml(type, fullName, ctx), buildText(type, fullName, ctx));
  } catch (err) {
    console.error(`[security-alert] yuborilmadi (${type}) -> ${to}: ${(err as Error).message}`);
  }
}

/** So'rovdan IP manzilni ajratib oladi (proxy orqasida X-Forwarded-For hisobga olinadi). */
export function clientIp(req: { headers?: Record<string, any>; ip?: string }): string | null {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.ip || null;
}

/**
 * Xavfsizlik voqeasini DB'ga yozadi (security_events jadvali — append-only audit).
 * Status kod: 1-login, 2-email/parol, 4-passkey, 5-2FA, 7-sessiya/logout.
 * Hech qachon throw qilmaydi — asosiy amal buzilmaydi.
 */
export async function recordSecurityEvent(
  userId: string,
  type: string,
  ctx: { ip?: string | null; userAgent?: string | null; metadata?: Record<string, unknown> } = {}
): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        userId,
        type,
        ip: ctx.ip || null,
        userAgent: ctx.userAgent || null,
        metadata: ctx.metadata as any,
      },
    });
  } catch (err) {
    console.error(`[security-event] yozilmadi (${type}) -> ${userId}: ${(err as Error).message}`);
  }
}

// Frontend manzili (emaildagi havolalar uchun)
export const supportUrl = config.frontendUrls[0] || 'https://cyber-zone.uz';
