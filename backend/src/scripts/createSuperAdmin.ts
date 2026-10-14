/**
 * YANGI SUPER_ADMIN YARATISH — eskisini TEGMASDAN
 * =====================================================================
 * MUAMMO (2026-10-14): Super admin paroli unutilgan.
 * YECHIM: yangi SUPER_ADMIN akkaunt yaratiladi, ESKI super_admin butunlay
 * o'z holida qoladi (2FA, passkey, settings, tokenVersion — hech narsa
 * o'zgarmaydi). Bu script faqat YANGI qator yaratadi yoki mavjud email
 * bo'sh qaytadi — HECH QANDAY UPDATE yozmaydi.
 *
 * ISHLATISH:
 *   SUPER_ADMIN_EMAIL=new@cyberzone.uz npx tsx src/scripts/createSuperAdmin.ts
 *   (parol ixtiyoriy — bo'sh qolsa tasodifiy generatsiya qilinadi va bir
 *    marta ekranda chiqadi, DB'ga plain-text tushmaydi)
 *
 * XAVFSIZLIK:
 *   • Password faqat hash sifatida saqlanadi (bcrypt).
 *   • Mavjud email allaqachon bor bo'lsa — o'zgartirmaydi, xato qaytaradi.
 *   • Super admin ID sini kiritmasa — eski super_admin tegilmaydi.
 *   • Production'da ham ishlaydi (NODE_SIZE dan qat'i nazar).
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

function requireEmail(): string {
  const raw = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!raw) {
    throw new Error(
      'SUPER_ADMIN_EMAIL majburiy.\n' +
        'Misol: SUPER_ADMIN_EMAIL=newboss@cyberzone.uz npx tsx src/scripts/createSuperAdmin.ts',
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    throw new Error(`Email noto'g'ri formatda: ${raw}`);
  }
  return raw;
}

async function main() {
  const email = requireEmail();
  const fullName = (process.env.SUPER_ADMIN_NAME || 'Super Admin').trim();

  // Parol ixtiyoriy: berilgan ishlatiladi, aks holda 16 belgili tasodifiy.
  const plainPassword =
    (process.env.SUPER_ADMIN_PASSWORD || '').trim() || crypto.randomBytes(12).toString('base64url');

  // --- OLDIN TEKSHIR: mavjud email bo'lsa — UPDATE YO'Q, to'xtaymiz ---
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`⚠️  "${email}" allaqachon mavjud (id=${existing.id}, role=${existing.role}).`);
    console.log('   Bu script MAVJUD akkauntni O\'ZGARTIRMAYDI — hech narsa qilmadim.');
    if (existing.role !== 'SUPER_ADMIN') {
      console.log('   Agar shu akkauntni SUPER_ADMIN qilish kerak bo\'lsa, boshqa yo\'l kerak.');
    }
    return;
  }

  const passwordHash = await bcrypt.hash(plainPassword, 10);

  // --- FAQAT YANGI QATOR YARATILADI (insert) — eski super_admin tegilmaydi ---
  const created = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName,
      role: 'SUPER_ADMIN',
      language: 'uz',
      status: 'ACTIVE',
      // mustChangePassword=false: yangi akkaunt to'g'ridan-to'g'ri kiradi.
      // (Istasangiz SUPER_ADMIN_MUST_CHANGE=1 qo'ying.)
      mustChangePassword: process.env.SUPER_ADMIN_MUST_CHANGE === '1',
    },
    select: { id: true, email: true, fullName: true, role: true, status: true },
  });

  // --- ESKI super_admin holatini TASDIQLASH uchun sanaymiz (o'zgartirmaymiz) ---
  const superAdmins = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, email: true },
  });

  console.log('✅ YANGI SUPER_ADMIN yaratildi (eski super_admin tegilmadi):');
  console.log(`   id:    ${created.id}`);
  console.log(`   email: ${created.email}`);
  console.log(`   name:  ${created.fullName}`);
  console.log(`   role:  ${created.role} / ${created.status}`);
  console.log('');
  console.log('🔑 Parol (faqat shu yerda bir marta ko\'rinadi, DB\'da faqat hash):');
  console.log(`   ${plainPassword}`);
  console.log('');
  console.log(`📊 Endi SUPER_ADMIN lar soni: ${superAdmins.length}`);
  for (const sa of superAdmins) {
    console.log(`   - ${sa.email} (${sa.id === created.id ? 'YANGI' : 'ESKI — o\'zgarmadi'})`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Xatolik:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
