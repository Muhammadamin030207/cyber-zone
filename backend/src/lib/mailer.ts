import nodemailer from 'nodemailer';
import { config } from '../config';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  if (config.email.user && config.email.pass) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: false,
      auth: { user: config.email.user, pass: config.email.pass },
    });
  }
  return transporter;
}

/**
 * Email yuborish. SMTP sozlanmagan bo'lsa, logda ko'rsatadi (dev rejim).
 * Dev da SMTP yo'q bo'lsa ham reset-token javobga kiritiladi (login sahifasida test uchun).
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    console.log(`[MAIL] (SMTP sozlanmagan — email yuborilmadi) To: ${to} | Subject: ${subject}`);
    console.log(`[MAIL] content:\n${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`);
    return false;
  }
  try {
    await t.sendMail({
      from: `"Cyber-ZONE" <${config.email.user}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error('[MAIL] yuborishda xatolik:', (err as Error).message);
    return false;
  }
}

export function buildResetEmail(resetUrl: string): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0b1020;border-radius:16px;color:#e6edf7;border:1px solid #1a2440">
    <div style="text-align:center;margin-bottom:20px">
      <span style="font-size:20px;font-weight:800">🎮 Cyber-ZONE</span>
    </div>
    <h2 style="color:#00d4ff;margin:0 0 12px">Parolni tiklash</h2>
    <p style="line-height:1.6;color:#aab6cc">Parolingizni tiklash uchun quyidagi tugmani bosing. Bu havola 1 soat davomida amal qiladi.</p>
    <div style="text-align:center;margin:24px 0">
      <a href="${resetUrl}" style="display:inline-block;padding:12px 28px;background:linear-gradient(90deg,#00d4ff,#7000ff);color:#fff;text-decoration:none;border-radius:12px;font-weight:700">Parolni tiklash</a>
    </div>
    <p style="color:#6b7896;font-size:12px;line-height:1.5">Agar siz bu so'rovni amalga oshirmagan bo'lsangiz, ushbu xatni e'tiborsiz qoldiring.</p>
  </div>`;
}