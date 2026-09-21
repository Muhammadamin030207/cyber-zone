import nodemailer from 'nodemailer';
import { config } from '../config';

export class MailerNotConfiguredError extends Error {
  constructor() {
    super('SMTP sozlanmagan (EMAIL_HOST/EMAIL_USER/EMAIL_PASS). Shimoliy xususiyat: Gmail App Password ishlatiladi.');
    this.name = 'MailerNotConfiguredError';
  }
}

const transporters = new Map<number, nodemailer.Transporter>();

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function buildTransporter(port: number): nodemailer.Transporter {
  const e = config.email;
  if (!e.host || !e.user || !e.pass) {
    throw new MailerNotConfiguredError();
  }
  // Gmail: EMAIL_USE_TLS=1 yoki port 465 bo'lsa TLS (secure), aks holda STARTTLS.
  const secure = e.secure || port === 465;
  return nodemailer.createTransport({
    host: e.host,
    port,
    secure,
    auth: { user: e.user, pass: e.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

function getTransporter(port: number): nodemailer.Transporter {
  let t = transporters.get(port);
  if (!t) {
    t = buildTransporter(port);
    transporters.set(port, t);
  }
  return t;
}

/**
 * Sinaladigan SMTP portlari: asosiy port + fallback portlar (dublikatsiz).
 * Render free web service'lari 25/465/587 portlariga chiquvchi trafikni
 * bloklaydi (paketlar jimgina tashlanadi -> ETIMEDOUT). Brevo esa 2525'ni
 * qo'llab-quvvatlaydi, shu sabab asosiy port ulanmasa fallback ishlatiladi.
 */
function smtpPorts(): number[] {
  const ports = [config.email.port, ...config.email.fallbackPorts];
  return Array.from(new Set(ports.filter((p) => Number.isFinite(p) && p > 0)));
}

/** Faqat tarmoq (TCP/TLS) darajasidagi xatolar boshqa portda qayta urinishga arziydi. */
function isConnectionError(err: any): boolean {
  if (err?.command === 'CONN') return true;
  return ['ETIMEDOUT', 'ETIMEOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'EDNS'].includes(
    err?.code
  );
}

function senderAddress(): string {
  return config.email.from || `"Cyber-ZONE" <${config.email.user}>`;
}

/**
 * Email yuborish. 
 *  - Production: real SMTP; SMTP xatosi TASHLANADI (sabab logda ko'rinadi).
 *  - Development: SMTP sozlanmagan bo'lsa email console'ga chiqariladi (mock EMAS —
 *    bu faqat lokal debugging, hech qachon soxta "yuborildi" javob bermaydi).
 *
 * Muaffaqiyatli bo'lsa `true` qaytaradi; muvaffaqiyatsiz bo'lsa aniq sabab bilan throw qiladi.
 */
export async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
  if (!isProduction()) {
    const t = buildTransporterSafe();
    if (!t && !config.email.user) {
      console.log('[MAIL:DEV] (SMTP sozlanmagan — email console log qilinadi)');
      console.log(`[MAIL:DEV] To: ${to}`);
      console.log(`[MAIL:DEV] Subject: ${subject}`);
      console.log(`[MAIL:DEV] Body text: ${text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`);
      return true;
    }
  }

  const mail = {
    from: senderAddress(),
    to,
    subject,
    html,
    text: text || htmlToText(html),
  };

  const ports = smtpPorts();
  let lastErr: any;
  for (let i = 0; i < ports.length; i++) {
    const port = ports[i];
    try {
      const info = await getTransporter(port).sendMail(mail);
      if (!isProduction()) {
        console.log(`[MAIL:DEV] yuborildi (${info.messageId}) To: ${to} Subject: ${subject}`);
      }
      if (i > 0) {
        console.log(`[MAIL] Email ${port}-port orqali yuborildi (asosiy ${ports[0]}-port ulanmadi).`);
      }
      return true;
    } catch (err: any) {
      lastErr = err;
      if (i < ports.length - 1 && isConnectionError(err)) {
        console.error(
          `[MAIL] ${port}-port ulanmadi (${err?.code || err?.message}); ${ports[i + 1]}-portda qayta urinib ko'riladi.`
        );
        continue;
      }
      break;
    }
  }

  const err = lastErr;
  const detail = err?.response
    ? `${err.message} | SMTP response: ${String(err.response).slice(0, 400)}`
    : err?.message || String(err);
  console.error(`[MAIL] yuborishda xatolik -> To: ${to} | Subject: ${subject}`);
  console.error(`[MAIL] Sabab: ${detail}`);
  if (err?.code) console.error(`[MAIL] SMTP kod: ${err.code}`);
  throw new Error(`Email yuborilmadi: ${detail}`);
}

/** Dev rejimda SMTP konfiguratsiyasi bor-yo'qligini log qiladi (transporter testi). */
export function checkMailerConfig(): { configured: boolean; reason: string } {
  try {
    getTransporter(config.email.port);
    const ports = smtpPorts().join(',');
    return { configured: true, reason: `${config.email.host}:${ports} (${config.email.secure ? 'TLS' : 'STARTTLS'})` };
  } catch (err: any) {
    return { configured: false, reason: err?.message || String(err) };
  }
}

function buildTransporterSafe(): nodemailer.Transporter | null {
  try {
    return buildTransporter(config.email.port);
  } catch {
    return null;
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Professional, Cyber-ZONE brendli, responsive HTML email. */
export function buildResetEmail(resetUrl: string, opts?: { locale?: string }): string {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const expiryLabel = expiresAt.toLocaleTimeString((opts?.locale === 'ru' ? 'ru-RU' : 'uz-UZ'), {
    hour: '2-digit',
    minute: '2-digit',
  });
  const brand = '🎮&nbsp;CYBER-ZONE';
  return `<!DOCTYPE html>
<html lang="uz" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<title>Cyber-ZONE — Parolni tiklash</title>
</head>
<body style="margin:0;padding:0;background-color:#070b16;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#e6edf7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#070b16;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding-bottom:20px;">
          <span style="font-size:22px;font-weight:800;letter-spacing:1px;color:#00d4ff;">${brand}</span>
        </td></tr>
        <tr><td style="background:linear-gradient(160deg,#0d1428 0%,#101a35 60%,#141032 100%);border:1px solid #1c2a4a;border-radius:18px;overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="height:4px;background:linear-gradient(90deg,#00d4ff,#7000ff,#ff2d95);"></td></tr>
            <tr><td style="padding:28px 24px;">
              <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#00d4ff;">Parolni tiklash</h1>
              <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#aab6cc;">
                Cyber-ZONE akkauntingiz uchun parolni tiklash so\u2019rovi qabul qilindi. Davom etish uchun quyidagi tugmani bosing:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td align="center" style="padding:6px 0 14px;">
                  <a href="${resetUrl}" style="display:inline-block;padding:14px 34px;background:linear-gradient(90deg,#00d4ff,#7000ff);color:#ffffff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;">Parolni tiklash</a>
                </td></tr>
              </table>
              <p style="margin:0 0 14px;font-size:13px;line-height:1.7;color:#8f9cb3;word-break:break-all;">
                Tugma ishlamasa, ushbu havolani brauzerda oching:<br />
                <a href="${resetUrl}" style="color:#00d4ff;">${resetUrl}</a>
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a101f;border:1px solid #1c2a4a;border-radius:12px;margin:6px 0 16px;">
                <tr><td style="padding:12px 16px;">
                  <p style="margin:0;font-size:13px;color:#e6edf7;">⏳ <b>Havola amal qilish muddati:</b> <span style="color:#00d4ff;">1 soat</span> (taxminan ${expiryLabel})</p>
                </td></tr>
              </table>
              <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7896">
                ⚠️ <b>Xavfsizlik</b>: bu so\u2019rovni siz amalga oshirmagan bo\u2019lsangiz, ushbu xatni e\u2019tiborsiz qoldiring va hech qanday havolani bosmang. Parolingizni hech kimga bermang. Cyber-ZONE hech qachon parol yoki to\u2019lov ma\u2019lumotlarini so\u2019ramaydi.
              </p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding-top:18px;">
          <p style="margin:0;font-size:11px;color:#47536e;line-height:1.6;">
            Cyber-ZONE — kompyuter xonalar SaaS platformasi<br style="display:none;" />
            Bu xat avtomatik yuborildi, unga javob bermang.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildResetText(resetUrl: string, expiryLabel: string): string {
  return `Cyber-ZONE — Parolni tiklash

Parolingizni tiklash uchun quyidagi havolani brauzerda oching:

${resetUrl}

Havola 1 soat davomida amal qiladi (taxminan ${expiryLabel}).

Agar bu so'rovni siz amalga oshirmagan bo'lsangiz, ushbu xatni e'tiborsiz qoldiring.

--- Cyber-ZONE`;
}

/** Vaqtinchalik parol — professional, brendli, responsive HTML email. */
export function buildTempPasswordEmail(fullName: string, tempPassword: string, expiresAt: Date): string {
  const expiryLabel = expiresAt.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  const brand = '🎮&nbsp;CYBER-ZONE';
  return `<!DOCTYPE html>
<html lang="uz" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<title>Cyber-ZONE — Vaqtinchalik parol</title>
</head>
<body style="margin:0;padding:0;background-color:#070b16;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#e6edf7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#070b16;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding-bottom:20px;">
          <span style="font-size:22px;font-weight:800;letter-spacing:1px;color:#00d4ff;">${brand}</span>
        </td></tr>
        <tr><td style="background:linear-gradient(160deg,#0d1428 0%,#101a35 60%,#141032 100%);border:1px solid #1c2a4a;border-radius:18px;overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="height:4px;background:linear-gradient(90deg,#00d4ff,#7000ff,#ff2d95);"></td></tr>
            <tr><td style="padding:28px 24px;">
              <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#00d4ff;">Vaqtinchalik parol</h1>
              <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#aab6cc;">
                Salom, <b style="color:#e6edf7;">${fullName}</b>. Cyber-ZONE akkauntingiz uchun vaqtinchalik parol yaratildi:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td align="center" style="padding:8px 0 16px;">
                  <span style="display:inline-block;padding:14px 26px;background:#0a101f;border:1px dashed #00d4ff;border-radius:12px;color:#00d4ff;font-size:20px;font-weight:800;letter-spacing:2px;font-family:ui-monospace,'Cascadia Mono',Consolas,monospace;">${tempPassword}</span>
                </td></tr>
              </table>
              <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#aab6cc;">
                Ushbu parol bilan saytga kirib, <b style="color:#e6edf7;">yangi parol o'rnatishingiz</b> shart. Vaqtinchalik parol faqat birinchi kirishda ishlaydi.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a101f;border:1px solid #1c2a4a;border-radius:12px;margin:6px 0 16px;">
                <tr><td style="padding:12px 16px;">
                  <p style="margin:0;font-size:13px;color:#e6edf7;">⏳ <b>Amal qilish muddati:</b> <span style="color:#00d4ff;">taxminan ${expiryLabel}</span></p>
                  <p style="margin:8px 0 0;font-size:13px;color:#e6edf7;">🔒 <b>Bir martalik:</b> kiritilgandan so'ng bekor bo'ladi.</p>
                </td></tr>
              </table>
              <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7896">
                ⚠️ <b>Xavfsizlik</b>: bu so'rovni siz amalga oshirmagan bo'lsangiz, ushbu xatni e'tiborsiz qoldiring. Parolingizni hech kimga bermang. Cyber-ZONE hech qachon parol yoki to'lov ma'lumotlarini so'ramaydi.
              </p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding-top:18px;">
          <p style="margin:0;font-size:11px;color:#47536e;line-height:1.6;">
            Cyber-ZONE — kompyuter xonalar SaaS platformasi<br style="display:none;" />
            Bu xat avtomatik yuborildi, unga javob bermang.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildTempPasswordText(fullName: string, tempPassword: string, expiresAt: Date): string {
  const expiryLabel = expiresAt.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  return `Cyber-ZONE — Vaqtinchalik parol

Salom, ${fullName}.

Yangi vaqtinchalik parolingiz:
${tempPassword}

Bu parol bilan saytga kiring va darhol yangi parol o'rnating.
Vaqtinchalik parol bir martalik va ${expiryLabel} gacha amal qiladi.

Agar bu so'rovni siz amalga oshirmagan bo'lsangiz, ushbu xatni e'tiborsiz qoldiring.

--- Cyber-ZONE`;
}