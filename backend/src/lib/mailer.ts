import nodemailer from 'nodemailer';
import { config } from '../config';

export class MailerNotConfiguredError extends Error {
  constructor() {
    super('SMTP sozlanmagan (EMAIL_HOST/EMAIL_USER/EMAIL_PASS). Shimoliy xususiyat: Gmail App Password ishlatiladi.');
    this.name = 'MailerNotConfiguredError';
  }
}

let transporter: nodemailer.Transporter | null = null;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function buildTransporter(): nodemailer.Transporter {
  const e = config.email;
  if (!e.host || !e.user || !e.pass) {
    throw new MailerNotConfiguredError();
  }
  // Gmail: EMAIL_USE_TLS=1 yoki port 465 bo'lsa TLS (secure), aks holda STARTTLS.
  const secure = e.secure || e.port === 465;
  return nodemailer.createTransport({
    host: e.host,
    port: e.port,
    secure,
    auth: { user: e.user, pass: e.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

function getTransporter(): nodemailer.Transporter {
  if (!transporter) transporter = buildTransporter();
  return transporter;
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

  const transporter = getTransporter();
  try {
    const info = await transporter.sendMail({
      from: senderAddress(),
      to,
      subject,
      html,
      text: text || htmlToText(html),
    });
    if (!isProduction()) {
      console.log(`[MAIL:DEV] yuborildi (${info.messageId}) To: ${to} Subject: ${subject}`);
    }
    return true;
  } catch (err: any) {
    const detail = err?.response
      ? `${err.message} | SMTP response: ${String(err.response).slice(0, 400)}`
      : err?.message || String(err);
    console.error(`[MAIL] yuborishda xatolik -> To: ${to} | Subject: ${subject}`);
    console.error(`[MAIL] Sabab: ${detail}`);
    if (err?.code) console.error(`[MAIL] SMTP kod: ${err.code}`);
    throw new Error(`Email yuborilmadi: ${detail}`);
  }
}

/** Dev rejimda SMTP konfiguratsiyasi bor-yo'qligini log qiladi (transporter testi). */
export function checkMailerConfig(): { configured: boolean; reason: string } {
  try {
    const t = getTransporter();
    return { configured: true, reason: `${config.email.host}:${config.email.port} (${config.email.secure ? 'TLS' : 'STARTTLS'})` };
  } catch (err: any) {
    return { configured: false, reason: err?.message || String(err) };
  }
}

function buildTransporterSafe(): nodemailer.Transporter | null {
  try {
    return buildTransporter();
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