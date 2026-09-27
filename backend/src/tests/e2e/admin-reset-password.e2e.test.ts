import { describe, it, expect, beforeAll } from 'vitest';
import { api, resetDb, auth, loginViaApi, createUserDirect, prisma } from './helpers';

/**
 * SUPER_ADMIN parol tiklash — EMAIL KANALIGA BOG'LIQ BO'LMAGAN zaxira yo'l.
 *
 * Nima uchun: "Parolni unutdingizmi" faqat email orqali ishlaydi. SMTP nosoz
 * yoki xatolarsiz yetkazilmasligi (Gmail spam/quarantine, SPF/DKIK yo'qligi)
 * holatda foydalanuvchi parolini umuman tiklay olmaydi.
 */
describe('E2E: SUPER_ADMIN parol tiklash (emaildan qat\'i nazar)', () => {
  let superAdminToken: string;
  let adminToken: string;
  let userToken: string;
  let superAdminId: string;
  let targetId: string;
  let targetEmail: string;
  let tempPassword = '';
  let tempToken = '';

  beforeAll(async () => {
    await resetDb();

    const superAdmin = await createUserDirect({
      email: 'reset-super@e2e.test',
      password: 'secret123',
      fullName: 'Super Admin',
      role: 'SUPER_ADMIN',
    });
    const admin = await createUserDirect({
      email: 'reset-admin@e2e.test',
      password: 'secret123',
      fullName: 'Admin',
      role: 'ADMIN',
    });
    const user = await createUserDirect({
      email: 'reset-user@e2e.test',
      password: 'secret123',
      fullName: 'Oddiy User',
    });

    superAdminId = superAdmin.id;
    targetId = user.id;
    targetEmail = user.email;

    superAdminToken = auth((await loginViaApi(superAdmin.email, 'secret123')).body.data.accessToken);
    adminToken = auth((await loginViaApi(admin.email, 'secret123')).body.data.accessToken);
    userToken = auth((await loginViaApi(user.email, 'secret123')).body.data.accessToken);
  });

  it('autentifikatsiyasiz -> 401', async () => {
    const res = await api().post(`/api/users/${targetId}/reset-password`).send({});
    expect(res.status).toBe(401);
  });

  it('USER -> 403 (faqat SUPER_ADMIN)', async () => {
    const res = await api()
      .post(`/api/users/${targetId}/reset-password`)
      .set('Authorization', userToken)
      .send({});
    expect(res.status).toBe(403);
  });

  it('ADMIN -> 403 (faqat SUPER_ADMIN)', async () => {
    const res = await api()
      .post(`/api/users/${targetId}/reset-password`)
      .set('Authorization', adminToken)
      .send({});
    expect(res.status).toBe(403);
  });

  it('mavjud bo\'lmagan user -> 404', async () => {
    const res = await api()
      .post('/api/users/00000000-0000-0000-0000-000000000000/reset-password')
      .set('Authorization', superAdminToken)
      .send({});
    expect(res.status).toBe(404);
  });

  it('SUPER_ADMIN o\'z parolini o\'zi tiklashi mumkin emas -> 400 (o\'zini bloklamaslik)', async () => {
    const res = await api()
      .post(`/api/users/${superAdminId}/reset-password`)
      .set('Authorization', superAdminToken)
      .send({});
    expect(res.status).toBe(400);
  });

  it('SUPER_ADMIN tiklashi mumkin -> 200 va vaqtinchalik parol qaytariladi', async () => {
    const res = await api()
      .post(`/api/users/${targetId}/reset-password`)
      .set('Authorization', superAdminToken)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.tempPassword).toMatch(/^[A-Za-z0-9_-]{12,20}$/);
    expect(res.body.data.email).toBe(targetEmail);
    expect(res.body.data.expiresAt).toBeTruthy();
    tempPassword = res.body.data.tempPassword;
  });

  it('vaqtinchalik parol DB\'da FAQAT hash sifatida saqlanadi (plain text yo\'q)', async () => {
    const row = await prisma.user.findUnique({ where: { id: targetId } });
    expect(row!.tempPasswordHash).toBeTruthy();
    expect(row!.tempPasswordHash).not.toBe(tempPassword);
    expect(row!.passwordHash).not.toBe(tempPassword);
    expect(row!.mustChangePassword).toBe(true);
    expect(row!.tempPasswordExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('eskirgan tiklash kanali tozalanadi (resetToken null)', async () => {
    await prisma.user.update({
      where: { id: targetId },
      data: { resetToken: 'stale-token', resetTokenExpiresAt: new Date(Date.now() + 999999) },
    });
    await api()
      .post(`/api/users/${targetId}/reset-password`)
      .set('Authorization', superAdminToken)
      .send({});

    const row = await prisma.user.findUnique({ where: { id: targetId } });
    expect(row!.resetToken).toBeNull();
    expect(row!.resetTokenExpiresAt).toBeNull();
  });

  it('vaqtinchalik parol bilan kirish mumkin -> MUST_CHANGE_PASSWORD tokeni beriladi', async () => {
    const fresh = await api()
      .post(`/api/users/${targetId}/reset-password`)
      .set('Authorization', superAdminToken)
      .send({});
    tempPassword = fresh.body.data.tempPassword;

    const res = await loginViaApi(targetEmail, tempPassword);
    // By design: kirish muvaffaqiyatli, LEKIN yangi parol majburiy
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('MUST_CHANGE_PASSWORD');
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.mustChangePassword).toBe(true);
    tempToken = res.body.data.accessToken;
  });

  it('vaqtinchalik parol bilan kirgach yangi parol QO\'YISH MAJBURIY (majburiy emas emas)', async () => {
    const row = await prisma.user.findUnique({ where: { id: targetId } });
    expect(row!.mustChangePassword).toBe(true);

    const res = await api()
      .post('/api/auth/set-new-password')
      .set('Authorization', `Bearer ${tempToken}`)
      .send({ newPassword: 'yangiParol123' });
    expect(res.status).toBe(200);

    const after = await prisma.user.findUnique({ where: { id: targetId } });
    expect(after!.mustChangePassword).toBe(false);
    expect(after!.tempPasswordHash).toBeNull();
    expect(after!.tempPasswordExpiresAt).toBeNull();
    // eski sessiyalar bekor qilinadi (tokenVersion oshdi)
    expect(after!.tokenVersion).toBeGreaterThan(0);
  });

  it('yangi parol bilan normal kirish ishlaydi, vaqtinchalik parol esa yo\'q', async () => {
    const res = await loginViaApi(targetEmail, 'yangiParol123');
    expect(res.status).toBe(200);
    expect(res.body.code).toBeUndefined();

    const old = await loginViaApi(targetEmail, tempPassword);
    expect(old.body.success).not.toBe(true);
  });

  it('vaqtinchalik parol MUDDATI o\'tgandan keyin ishlamaydi', async () => {
    const fresh = await api()
      .post(`/api/users/${targetId}/reset-password`)
      .set('Authorization', superAdminToken)
      .send({});
    const shortLived = fresh.body.data.tempPassword;

    // muddatini o'tkazib yuboramiz
    await prisma.user.update({
      where: { id: targetId },
      data: { tempPasswordExpiresAt: new Date(Date.now() - 1000) },
    });

    const res = await loginViaApi(targetEmail, shortLived);
    expect(res.body.success).not.toBe(true);
    expect(res.body.code).not.toBe('MUST_CHANGE_PASSWORD');
  });

  it('2FA yoqilgan bo\'lsa ham O\'CHIRILMAYDI (alohida himoya saqlanadi)', async () => {
    await prisma.user.update({
      where: { id: targetId },
      data: { twoFactorEnabled: true, twoFactorSecret: 'JBSWY3DPEHPK3PXP' },
    });

    const res = await api()
      .post(`/api/users/${targetId}/reset-password`)
      .set('Authorization', superAdminToken)
      .send({});
    expect(res.status).toBe(200);

    const row = await prisma.user.findUnique({ where: { id: targetId } });
    expect(row!.twoFactorEnabled).toBe(true);
  });

  it('har bir tiklash SECURITY_EVENTS jadvaliga yoziladi (audit)', async () => {
    const events = await prisma.securityEvent.findMany({
      where: { userId: targetId, type: 'PASSWORD_RESET_BY_ADMIN' },
    });
    expect(events.length).toBeGreaterThan(0);
  });
});
