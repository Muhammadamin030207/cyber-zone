import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma';

/** Mobil/responsive UI E2E uchun minimal ma'lumotlar (E2E DB). */
async function main() {
  const passwordHash = await bcrypt.hash('secret123', 4);

  const admin = await prisma.user.upsert({
    where: { email: 'admin-ui@e2e.test' },
    update: {},
    create: { email: 'admin-ui@e2e.test', passwordHash, fullName: 'Admin UI', role: 'ADMIN' },
  });

  const user = await prisma.user.upsert({
    where: { email: 'ui-user@e2e.test' },
    update: {},
    create: { email: 'ui-user@e2e.test', passwordHash, fullName: 'UI User', role: 'USER' },
  });

  let room = await prisma.computerRoom.findFirst({ where: { ownerId: admin.id } });
  if (!room) {
    room = await prisma.computerRoom.create({
      data: {
        ownerId: admin.id,
        name: 'UI Test Room',
        address: 'Toshkent, UI 1',
        city: 'Toshkent',
        status: 'ACTIVE',
        workingHours: { open: '09:00', close: '23:00' },
      },
    });
  }
  let zone = await prisma.zone.findFirst({ where: { roomId: room.id } });
  if (!zone) {
    zone = await prisma.zone.create({
      data: { roomId: room.id, type: 'GENERAL_HALL', name: 'Main Hall', pricePerHour: 20000 },
    });
  }

  const existingBooking = await prisma.booking.findFirst({ where: { userId: user.id } });
  if (!existingBooking) {
    await prisma.booking.create({
      data: {
        userId: user.id,
        roomId: room.id,
        zoneId: zone.id,
        date: new Date('2026-12-01'),
        startTime: '14:00',
        endTime: '17:00',
        durationHours: 3,
        totalPrice: 60000,
        finalPrice: 60000,
        advanceAmount: 18000,
        remainingAmount: 42000,
        depositPercent: 30,
        status: 'PENDING',
      },
    });
  }

  console.log('UI seed done:', { admin: admin.email, user: user.email, room: room.name });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
