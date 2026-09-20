/**
 * SMTP test: npm run test:mail [to@example.com]
 *
 * Configuratsiya ishlayotganini aniq ko'rsatadi:
 *  - EMAIL_* env o'qilgan/qiyoslangan
 *  - SMTP server bilan ulanish + auth tekshiruvi
 *  - Haqiqiy sinov email yuborish (mock EMAS)
 *
 * Namuna: npm run test:mail you@gmail.com
 */
import { config } from '../config';
import { sendEmail, buildResetEmail, buildResetText } from '../lib/mailer';

async function main() {
  const e = config.email;
  const recipient = process.argv[2] || process.env.EMAIL_TEST_TO || '';

  console.log('===== Cyber-ZONE SMTP tekshiruvi =====');
  console.log('Environment:                ', process.env.NODE_ENV || 'development');
  console.log('EMAIL_HOST:                 ', e.host || '(sozlanmagan)');
  console.log('EMAIL_PORT:                 ', e.port);
  console.log('EMAIL_USE_TLS (secure):     ', e.secure || e.port === 465);
  console.log('EMAIL_USER:                 ', e.user ? e.user.replace(/(^.{2}).+(@.*)$/, '$1***$2') : '(sozlanmagan)');
  console.log('EMAIL_PASS (o\'rnatilganmi): ', e.pass ? 'ha ✓' : 'yo\'q ✗');
  console.log('DEFAULT_FROM_EMAIL:         ', e.from || `"Cyber-ZONE" <${e.user || 'no-reply'}>`);
  console.log('Recipient:                  ', recipient || '(argument berilmadi: npm run test:mail to@example.com)');

  if (!e.host || !e.user || !e.pass) {
    console.error('\n✗ SMTP to\'liq sozlanmagan. Gmail uchun App Password ishlating va quyidagilarni o\'rnating:');
    console.error('  EMAIL_HOST=smtp.gmail.com');
    console.error('  EMAIL_PORT=587');
    console.error('  EMAIL_USER=you@gmail.com');
    console.error('  EMAIL_PASS=<16-belgili App Password>');
    process.exit(1);
  }
  if (!recipient) {
    console.error('\n✗ Sinov email jo\'natuvchi/an recipient kerak: npm run test:mail to@example.com');
    process.exit(1);
  }

  console.log('\nSMTP bilan ulanish + haqiqiy email yuborish...');
  const resetUrl = `${config.frontendUrls[0] || 'http://localhost:3006'}/reset-password?token=smoke-test-${Date.now()}`;
  try {
    const ok = await sendEmail(recipient, 'Cyber-ZONE — SMTP sinov xati', buildResetEmail(resetUrl), buildResetText(resetUrl, '1 soat'));
    console.log(`\n✓ Muvaffaqiyatli! Email yuborildi: ${recipient}`);
    console.log('  (bir necha daqiqada keladi; yo‘q bo‘lsa Spam/Updates papkasini tekshiring)');
    process.exit(ok ? 0 : 1);
  } catch (err) {
    console.error(`\n✗ Email yuborilmadi: ${(err as Error).message}`);
    console.error('  Tekshiring: EMAIL_PASS Gmail App Password (oddiy Gmail paroli ishlamaydi).');
    console.error('  App Password: https://myaccount.google.com/apppasswords dan 16-belgili parol oling.');
    process.exit(1);
  }
}

main();