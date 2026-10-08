import { describe, it, expect, beforeAll } from 'vitest';
import { resetDb, createUserDirect, createRoomFixture, createBookingFixture, prisma, api, auth, loginViaApi } from './helpers';
import { buildRoleContext } from '../../controllers/ai.controller';

/**
 * AI ROLLI KONTEKST — MA'LUMOT SIZIB CHIQISHI (LEAK) REGRESSION TESTI
 * =====================================================================
 * Qoida: foydalanuvchining suhbat kontekstini SERVER ro'l asosida cheklaydi.
 *   • USER      — faqat o'z bron/to'lov ma'lumotlari.
 *   • ADMIN     — shaxsiy + faqat O'Z XONALARI bo'yicha navbat (boshqa xona yo'q).
 *   • SUPER_ADMIN — agregatlar (sanamalar), boshqa foydalanuvchining shaxsiy
 *                   ma'lumotlari kontekstga tushmaydi.
 * Bu yerda biz buildRoleContext'ni to'g'ridan-to'g'ri test qilamiz — chunki
 * haqiqiy javobga ta'siri LLM kaliti mavjudligiga bog'liq, lekin kontekstning
 * O'ZI har doim serverda shu funksiya bilan yig'iladi.
 */
describe('AI ROLLI KONTEKST: USER/ADMIN/SUPER_ADMIN ma\'lumot chegaralari', () => {
  let userAId: string, userAToken: string;
  let adminId: string, adminToken: string;
  let admin2Id: string;
  let superAdminId: string;
  let room1Name = ''; // admin (ownerAdmin) xonasi — U admin ko'rishi KERAK
  let room2Name = ''; // ownerAdmin2 xonasi — U dan YASHIRILISHI kerak
  let bookingB1Id = ''; // userB uchun room1 dagi bron — admin1 ko'rishi kerak
  let bookingB2Id = ''; // userB uchun room2 dagi bron — admin1 KO'RMASLIGI kerak
  let bookingA1Id = ''; // userA uchun room1 dagi bron — userA o'ziniki

  beforeAll(async () => {
    await resetDb();

    const ownerAdmin = await createUserDirect({ email: 'ai-owner1@e2e.test', password: 'secret123', fullName: 'Owner Admin One', role: 'ADMIN' });
    adminId = ownerAdmin.id;
    const ownerAdmin2 = await createUserDirect({ email: 'ai-owner2@e2e.test', password: 'secret123', fullName: 'Owner Admin Two', role: 'ADMIN' });
    admin2Id = ownerAdmin2.id;
    const superAdmin = await createUserDirect({ email: 'ai-super@e2e.test', password: 'secret123', fullName: 'Super Admin', role: 'SUPER_ADMIN' });
    const userA = await createUserDirect({ email: 'ai-user-a@e2e.test', password: 'secret123', fullName: 'Ai User A' });
    userAId = userA.id;
    const userB = await createUserDirect({ email: 'ai-user-b@e2e.test', password: 'secret123', fullName: 'Ai User B' });

    adminToken = auth((await loginViaApi(ownerAdmin.email!, 'secret123')).body.data.accessToken);
    userAToken = auth((await loginViaApi(userA.email!, 'secret123')).body.data.accessToken);
    superAdminId = superAdmin.id;

    // room1 — ownerAdmin'ga tegishli (admin1 kontekstida bo'lishi KERAK)
    const f1 = await createRoomFixture(adminId);
    await prisma.computerRoom.update({ where: { id: f1.room.id }, data: { name: 'Owner1 Hall' } });
    await prisma.zone.update({ where: { id: f1.zone.id }, data: { name: 'GENERAL_HALL' } });
    room1Name = 'Owner1 Hall';

    // room2 — ownerAdmin2'ga tegishli (admin1 kontekstiga TUSHMASLIGI kerak)
    const room2 = await prisma.computerRoom.create({
      data: {
        ownerId: admin2Id,
        name: 'Owner2 Hall',
        address: 'Toshkent, Test 2',
        city: 'Toshkent',
        status: 'ACTIVE',
        workingHours: { open: '09:00', close: '23:00' },
      },
    });
    const zone2 = await prisma.zone.create({ data: { roomId: room2.id, type: 'VIP', name: 'VIP', pricePerHour: 50000 } });
    room2Name = 'Owner2 Hall';

    // room1 dagi bron (userB) — admin1 ko'rishi KERAK
    const bB1 = await createBookingFixture(userB.id, f1.room.id, f1.zone.id, 90000);
    bookingB1Id = bB1.id;
    // room2 dagi bron (userA) — admin1 KO'RMASLIGI KERAK (xona boshqa odamniki)
    const bB2 = await createBookingFixture(userA.id, room2.id, zone2.id, 120000);
    bookingB2Id = bB2.id;
    // room1 dagi bron (userA, own) — userA o'z kontekstida ko'rishi KERAK
    const bA1 = await createBookingFixture(userA.id, f1.room.id, f1.zone.id, 80000);
    bookingA1Id = bA1.id;

    // room1 dagi PENDING to'lov (chek yuborilgan) — admin1 kontekstida ko'rinadi
    await prisma.payment.create({
      data: {
        bookingId: bookingB1Id,
        userId: userB.id,
        amount: 27000,
        type: 'ADVANCE',
        method: 'TRANSFER',
        status: 'PENDING',
        currency: 'UZS',
        depositPercent: 30,
        proofSubmittedAt: new Date(),
        proofCardLast4: '4321',
        proofCardholderName: 'B User',
      } as any,
    });
    // room2 dagi PENDING to'lov — admin1 KO'RMASLIGI kerak (bookingB2Id room2 da)
    await prisma.payment.create({
      data: {
        bookingId: bookingB2Id,
        userId: userB.id,
        amount: 60000,
        type: 'ADVANCE',
        method: 'CLICK',
        status: 'PENDING',
        currency: 'UZS',
        depositPercent: 30,
      } as any,
    });
  });

  it('USER: faqat o\'z ma\'lumoti — boshqa foydalanuvchining bron/to\'lovlari YO\'Q', async () => {
    const ctx = await buildRoleContext(userAId);
    expect(ctx).toContain('Ai User A');
    expect(ctx).toContain(`#${bookingA1Id.slice(0, 8)}`);
    // Boshqa foydalanuvchining (userB) broni va ismi yashiringan
    expect(ctx).not.toContain(`#${bookingB1Id.slice(0, 8)}`);
    expect(ctx).not.toContain('Ai User B');
    expect(ctx).not.toContain('BOSHQARUV KONTEKSTI');
    expect(ctx).not.toContain('PLATFORMA STATISTIKASI');
  });

  it('ADMIN: o\'z xonasi navbati ko\'rinadi, boshqa xona YO\'Q', async () => {
    const ctx = await buildRoleContext(adminId);
    expect(ctx).toContain('BOSHQARUV KONTEKSTI (ADMIN');
    expect(ctx).toContain(room1Name);
    expect(ctx).toContain(`#${bookingB1Id.slice(0, 8)}`);
    expect(ctx).toContain('chek yuborilgan: ha');
    // Boshqa owner'ning xonasi, uning broni va PENDING to'lovi tushmagan
    expect(ctx).not.toContain(room2Name);
    expect(ctx).not.toContain('Owner Admin Two');
    expect(ctx).not.toContain('PLATFORMA STATISTIKASI');
  });

  it('SUPER_ADMIN: faqat agregatlar — boshqa foydalanuvchining shaxsiy ismi YO\'Q', async () => {
    const ctx = await buildRoleContext(superAdminId);
    expect(ctx).toContain('PLATFORMA STATISTIKASI (SUPER_ADMIN)');
    expect(ctx).toContain('Jami foydalanuvchilar');
    expect(ctx).toContain("Bronlar holati bo'yicha");
    // Shaxsiy ma'lumot emas: boshqa foydalanuvchilar ismi/emaili kontekstda yo'q
    expect(ctx).not.toContain('Ai User A');
    expect(ctx).not.toContain('Ai User B');
    expect(ctx).not.toContain('ai-user-a@e2e.test');
  });

  it('chat API: ADMIN sifatida 200 (rolli kontekst serverda xatosiz yig\'iladi)', async () => {
    const res = await api().post('/api/ai/chat').set('Authorization', adminToken).send({ message: 'salom' });
    expect(res.status).toBe(200);
    expect(typeof res.body.data.reply).toBe('string');
    expect(res.body.data.reply.length).toBeGreaterThan(0);
  });

  it('/api/ai/status: AI_PROVIDER/AI_MODEL ko\'rsatiladi, kalit qiymati chiqmaydi', async () => {
    const res = await api().get('/api/ai/status').set('Authorization', userAToken);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.provider).toBe('auto');
    expect(Array.isArray(d.providerOrder)).toBe(true);
    expect(d.providerOrder).toContain('anthropic');
    const raw = JSON.stringify(d);
    expect(raw).not.toMatch(/AIza|sk-ant|sk-/);
  });
});