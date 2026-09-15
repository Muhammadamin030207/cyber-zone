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

  // ============ 1. SUPER ADMIN ============
  const existingSuperAdmin = await prisma.user.findUnique({
    where: { email: superAdminEmail },
  });

  let superAdmin;
  if (existingSuperAdmin) {
    superAdmin = existingSuperAdmin;
    console.log('✅ Super Admin allaqachon mavjud:', superAdmin.email);
  } else {
    const passwordHash = await bcrypt.hash(superAdminPassword, 10);
    superAdmin = await prisma.user.create({
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

  // ============ 2. DEMO ADMINLAR (2 ta) ============
  const adminsToCreate = [
    { email: 'admin@neon.uz', password: 'Admin123!', fullName: 'Neon Arena Admin', phone: '+998901112233' },
    { email: 'admin@pixel.uz', password: 'Admin123!', fullName: 'Pixel Cafe Admin', phone: '+998902223344' },
  ];

  const admins: any[] = [];
  for (const a of adminsToCreate) {
    let admin = await prisma.user.findUnique({ where: { email: a.email } });
    if (!admin) {
      admin = await prisma.user.create({
        data: {
          email: a.email,
          passwordHash: await bcrypt.hash(a.password, 10),
          fullName: a.fullName,
          phone: a.phone,
          role: 'ADMIN',
          language: 'uz',
        },
      });
      console.log(`✅ Admin yaratildi: ${a.email}`);
    }
    admins.push(admin);
  }

  // ============ 3. DEMO XONALAR ============
  const roomsData = [
    {
      name: 'Neon Arena',
      ownerEmail: 'admin@neon.uz',
      description: "Yunusoboddagi eng zamonaviy gaming arena. RTX 4070, 144Hz monitorlar, VIP qulayliklar.",
      address: 'Toshkent, Yunusobod tumani, Amir Temur ko\'chasi 150',
      latitude: 41.3111,
      longitude: 69.2797,
      phone: '+998901112233',
      workingHours: { open: '09:00', close: '24:00' },
      status: 'ACTIVE' as const,
      zones: [
        {
          type: 'GENERAL_HALL' as const,
          name: 'Umumiy zal',
          description: 'RTX 3060, 27" 144Hz monitorlar',
          capacity: 20,
          pricePerHour: 15000,
          computers: [
            { name: 'PC-01', specs: { cpu: 'AMD Ryzen 5 5600', gpu: 'RTX 3060 12GB', ram: 16, monitor: '27" 144Hz', storage: '512GB NVMe' } },
            { name: 'PC-02', specs: { cpu: 'AMD Ryzen 5 5600', gpu: 'RTX 3060 12GB', ram: 16, monitor: '27" 144Hz', storage: '512GB NVMe' } },
            { name: 'PC-03', specs: { cpu: 'AMD Ryzen 5 5600', gpu: 'RTX 3060 12GB', ram: 16, monitor: '27" 144Hz', storage: '512GB NVMe' } },
            { name: 'PC-04', specs: { cpu: 'AMD Ryzen 5 5600', gpu: 'RTX 3060 12GB', ram: 16, monitor: '27" 144Hz', storage: '512GB NVMe' } },
            { name: 'PC-05', specs: { cpu: 'AMD Ryzen 5 5600', gpu: 'RTX 3060 12GB', ram: 16, monitor: '27" 144Hz', storage: '512GB NVMe' } },
          ],
        },
        {
          type: 'VIP' as const,
          name: 'VIP zona',
          description: 'RTX 4070, keng o\'rindiqlar, shaxsiy yoritish',
          capacity: 8,
          pricePerHour: 30000,
          computers: [
            { name: 'VIP-01', specs: { cpu: 'Intel i7-13700', gpu: 'RTX 4070 12GB', ram: 32, monitor: '27" 240Hz', storage: '1TB NVMe' } },
            { name: 'VIP-02', specs: { cpu: 'Intel i7-13700', gpu: 'RTX 4070 12GB', ram: 32, monitor: '27" 240Hz', storage: '1TB NVMe' } },
            { name: 'VIP-03', specs: { cpu: 'Intel i7-13700', gpu: 'RTX 4070 12GB', ram: 32, monitor: '27" 240Hz', storage: '1TB NVMe' } },
            { name: 'VIP-04', specs: { cpu: 'Intel i7-13700', gpu: 'RTX 4070 12GB', ram: 32, monitor: '27" 240Hz', storage: '1TB NVMe' } },
          ],
        },
        {
          type: 'CABIN' as const,
          name: 'Kabinalar',
          description: 'Shaxsiy kabina, ovoz o\'tkazmaydigan devorlar',
          capacity: 4,
          pricePerHour: 25000,
          computers: [
            { name: 'CAB-01', specs: { cpu: 'Intel i5-13400', gpu: 'RTX 4060 8GB', ram: 32, monitor: '27" 180Hz', storage: '1TB NVMe' } },
            { name: 'CAB-02', specs: { cpu: 'Intel i5-13400', gpu: 'RTX 4060 8GB', ram: 32, monitor: '27" 180Hz', storage: '1TB NVMe' } },
          ],
        },
      ],
    },
    {
      name: 'Pixel Cafe',
      ownerEmail: 'admin@pixel.uz',
      description: "Chilonzordagi qulay kiber kafe. Kofe, o'yin, internet — hammasi bitta joyda.",
      address: 'Toshkent, Chilonzor tumani, Qatortol ko\'chasi 12',
      latitude: 41.2784,
      longitude: 69.1992,
      phone: '+998902223344',
      workingHours: { open: '10:00', close: '23:00' },
      status: 'ACTIVE' as const,
      zones: [
        {
          type: 'GENERAL_HALL' as const,
          name: 'Umumiy zal',
          description: 'RTX 3060, 24" monitorlar',
          capacity: 15,
          pricePerHour: 12000,
          computers: [
            { name: 'PC-01', specs: { cpu: 'AMD Ryzen 5 3600', gpu: 'RTX 2060 6GB', ram: 16, monitor: '24" 75Hz', storage: '256GB SSD' } },
            { name: 'PC-02', specs: { cpu: 'AMD Ryzen 5 3600', gpu: 'RTX 2060 6GB', ram: 16, monitor: '24" 75Hz', storage: '256GB SSD' } },
            { name: 'PC-03', specs: { cpu: 'AMD Ryzen 5 3600', gpu: 'RTX 2060 6GB', ram: 16, monitor: '24" 75Hz', storage: '256GB SSD' } },
          ],
        },
        {
          type: 'VIP' as const,
          name: 'VIP zona',
          description: 'Yuqori specs, kofe bar yaqinida',
          capacity: 4,
          pricePerHour: 22000,
          computers: [
            { name: 'VIP-01', specs: { cpu: 'Intel i5-12400', gpu: 'RTX 3070 8GB', ram: 32, monitor: '27" 165Hz', storage: '512GB NVMe' } },
            { name: 'VIP-02', specs: { cpu: 'Intel i5-12400', gpu: 'RTX 3070 8GB', ram: 32, monitor: '27" 165Hz', storage: '512GB NVMe' } },
          ],
        },
      ],
    },
  ];

  const demoRooms: any[] = [];
  for (const roomData of roomsData) {
    const owner = admins.find((a) => a.email === roomData.ownerEmail);
    if (!owner) continue;

    // Agar owner'da allaqachon xona bo'lsa, skip
    const existingRoom = await prisma.computerRoom.findUnique({
      where: { ownerId: owner.id },
      include: { zones: { include: { computers: true } } },
    });

    if (existingRoom) {
      console.log(`ℹ️ "${roomData.name}" xona allaqachon mavjud — skip`);
      demoRooms.push(existingRoom);
      continue;
    }

    const room = await prisma.computerRoom.create({
      data: {
        ownerId: owner.id,
        name: roomData.name,
        description: roomData.description,
        address: roomData.address,
        latitude: roomData.latitude,
        longitude: roomData.longitude,
        phone: roomData.phone,
        workingHours: roomData.workingHours,
        status: roomData.status,
        zones: {
          create: roomData.zones.map((z: any) => ({
            type: z.type,
            name: z.name,
            description: z.description,
            capacity: z.capacity,
            pricePerHour: z.pricePerHour,
            computers: {
              create: z.computers.map((c: any) => ({
                name: c.name,
                specs: c.specs,
                status: 'AVAILABLE',
              })),
            },
          })),
        },
      },
      include: { zones: { include: { computers: true } } },
    });

    demoRooms.push(room);
    console.log(`✅ Xona yaratildi: "${roomData.name}"`);
  }

  // ============ 4. DEMO BRONLAR ============
  // Demo user (agar mavjud bo'lmasa)
  let demoUser = await prisma.user.findUnique({ where: { email: 'demo@user.uz' } });
  if (!demoUser) {
    demoUser = await prisma.user.create({
      data: {
        email: 'demo@user.uz',
        passwordHash: await bcrypt.hash('Demo123!', 10),
        fullName: 'Demo User',
        phone: '+998903334455',
        role: 'USER',
        language: 'uz',
      },
    });
    console.log('✅ Demo user yaratildi: demo@user.uz (Demo123!)');
  }

  // Bronlar soni
  const existingBookings = await prisma.booking.count();
  if (existingBookings === 0 && demoUser) {
    const room1 = demoRooms[0];
    const zone1 = room1?.zones[0];
    const computer1 = zone1?.computers[0];

    if (zone1 && computer1) {
      const pricePerHour = Number(zone1.pricePerHour);
      const bookingsData = [
        {
          date: '2026-09-20',
          startTime: '14:00',
          endTime: '16:00',
          status: 'PENDING' as const,
          notes: 'Dota 2 o\'ynash uchun',
        },
        {
          date: '2026-09-18',
          startTime: '10:00',
          endTime: '12:00',
          status: 'ACTIVE' as const,
          notes: '',
        },
        {
          date: '2026-09-15',
          startTime: '18:00',
          endTime: '20:00',
          status: 'COMPLETED' as const,
          notes: 'CS2 sessiya',
        },
      ];

      for (const b of bookingsData) {
        const duration = 2;
        const total = pricePerHour * duration;
        await prisma.booking.create({
          data: {
            userId: demoUser.id,
            roomId: room1.id,
            zoneId: zone1.id,
            computerId: computer1.id,
            date: new Date(b.date),
            startTime: b.startTime,
            endTime: b.endTime,
            durationHours: duration,
            totalPrice: total,
            discountAmount: 0,
            finalPrice: total,
            advanceAmount: +(total * 0.3).toFixed(2),
            remainingAmount: +(total * 0.7).toFixed(2),
            status: b.status,
            notes: b.notes,
          },
        });
      }
      console.log(`✅ ${bookingsData.length} ta demo bron yaratildi`);
    } else {
      console.log('⚠️ Xona/zona/kompyuter topilmadi — bronlar yaratilmadi');
    }
  } else if (existingBookings > 0) {
    console.log(`ℹ️ ${existingBookings} ta bron allaqachon mavjud — skip`);
  }

  // ============ 5. PROMO-KODLAR ============
  const existingPromo = await prisma.promoCode.count();
  if (existingPromo === 0 && demoRooms[0]) {
    const now = new Date();
    const promos = [
      {
        code: 'YANGIYIL25',
        roomId: demoRooms[0].id,
        discountType: 'PERCENTAGE',
        discountValue: 25,
        minBookingAmount: 50000,
        maxUses: 100,
        startsAt: now,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // +90 kun
      },
      {
        code: 'UCHINCHISI-50',
        roomId: demoRooms[0].id,
        discountType: 'FIXED',
        discountValue: 5000,
        startsAt: now,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 kun
      },
    ];

    for (const p of promos) {
      await prisma.promoCode.create({
        data: {
          ...p,
          createdBy: superAdmin.id,
        },
      });
    }
    console.log(`✅ ${promos.length} ta promo-kod yaratildi`);
  } else {
    console.log(`ℹ️ Promo-kodlar allaqachon mavjud — skip`);
  }

  // ============ 6. DEMO YANGILIKLAR ============
  const existingNews = await prisma.news.count();
  if (existingNews === 0) {
    const newsItems = [
      {
        roomId: demoRooms[0]?.id,
        title: 'RTX 4070 yangi zonalar ochildi!',
        content: 'VIP zonamizga RTX 4070, 240Hz' + " monitorlar o'rnatildi. Keling va yangi zamonaviy o'yindan bahramand bo'ling!",
        type: 'NEWS' as const,
      },
      {
        roomId: demoRooms[0]?.id,
        title: 'Kechki chegirma — 40%!',
        content: "Soat 22:00 dan keyin barcha zonalarga 40% chegirma. Zug' raketangizni oling!",
        type: 'PROMOTION' as const,
      },
      {
        roomId: null,
        title: 'Cyber-ZONE platformasi ishga tushdi!',
        content: 'Endi kompyuter xonalarini onlayn bron qilish mumkin. O\'z xonangizni toping va bron qiling!',
        type: 'BANNER' as const,
      },
    ];

    for (const n of newsItems) {
      await prisma.news.create({
        data: {
          ...n,
          authorId: n.roomId ? admins.find((a) => a.id === demoRooms[0]?.ownerId)?.id || superAdmin.id : superAdmin.id,
        },
      });
    }
    console.log(`✅ ${newsItems.length} ta yangilik yaratildi`);
  } else {
    console.log(`ℹ️ Yangiliklar allaqachon mavjud — skip`);
  }

  // ============ 7. SHARHLAR ============
  const existingReviews = await prisma.review.count();
  if (existingReviews === 0 && demoUser && demoRooms[0]) {
    await prisma.review.create({
      data: {
        userId: demoUser.id,
        roomId: demoRooms[0].id,
        rating: 5,
        comment: "Ajoyib joy! Kompyuterlar yangi, internet tez, xodimlar mehribon.", 
      },
    });
    console.log('✅ Demo sharh yaratildi');
  }

  console.log('\n🌱 Seeding tugadi!');
  console.log('   Test hisoblar:');
  console.log('   - Super Admin:', superAdminEmail, '/', superAdminPassword);
  console.log('   - Admin 1:', 'admin@neon.uz / Admin123!');
  console.log('   - Admin 2:', 'admin@pixel.uz / Admin123!');
  console.log('   - User:', 'demo@user.uz / Demo123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });