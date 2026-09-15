import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'superadmin@cyberzone.uz';
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!';
  const superAdminName = process.env.SUPER_ADMIN_NAME || 'Super Admin';

  console.log('🌱 Seeding boshlanmoqda...');

  // Super Admin yaratish (agar mavjud bo'lmasa)
  const existing = await prisma.user.findUnique({
    where: { email: superAdminEmail },
  });

  if (existing) {
    console.log('✅ Super Admin allaqachon mavjud:', existing.email);
  } else {
    const passwordHash = await bcrypt.hash(superAdminPassword, 10);
    const superAdmin = await prisma.user.create({
      data: {
        email: superAdminEmail,
        passwordHash,
        fullName: superAdminName,
        role: 'SUPER_ADMIN',
        language: 'uz',
      },
    });
    console.log('✅ Super Admin yaratildi:', superAdmin.email);
    console.log('   Parol:', superAdminPassword);
  }

  console.log('🌱 Seeding tugadi!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });