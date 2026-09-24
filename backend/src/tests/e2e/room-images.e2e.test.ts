import { describe, it, expect, beforeAll } from 'vitest';
import { api, resetDb, auth, loginViaApi, createUserDirect, createRoomFixture, prisma } from './helpers';

describe('E2E: Computer room images + role-based booking/payment access', () => {
  let ownerToken: string;
  let otherAdminToken: string;
  let superAdminToken: string;
  let userToken: string;
  let roomId: string;

  beforeAll(async () => {
    await resetDb();

    const owner = await createUserDirect({ email: 'img-owner@e2e.test', password: 'secret123', fullName: 'Room Owner', role: 'ADMIN' });
    const otherAdmin = await createUserDirect({ email: 'img-other@e2e.test', password: 'secret123', fullName: 'Other Admin', role: 'ADMIN' });
    const superAdmin = await createUserDirect({ email: 'img-super@e2e.test', password: 'secret123', fullName: 'Super Admin', role: 'SUPER_ADMIN' });
    const user = await createUserDirect({ email: 'img-user@e2e.test', password: 'secret123', fullName: 'Simple User' });

    ownerToken = auth((await loginViaApi(owner.email, 'secret123')).body.data.accessToken);
    otherAdminToken = auth((await loginViaApi(otherAdmin.email, 'secret123')).body.data.accessToken);
    superAdminToken = auth((await loginViaApi(superAdmin.email, 'secret123')).body.data.accessToken);
    userToken = auth((await loginViaApi(user.email, 'secret123')).body.data.accessToken);

    const { room } = await createRoomFixture(owner.id);
    roomId = room.id;
  });

  it('USER rasm yuklay olmaydi -> 403', async () => {
    const res = await api()
      .post(`/api/rooms/${roomId}/images`)
      .set('Authorization', userToken)
      .attach('file', Buffer.from('fake-image-bytes'), { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(403);
  });

  it('boshqa ADMIN (egalik qilmaydigan) rasm yuklay olmaydi -> 403', async () => {
    const res = await api()
      .post(`/api/rooms/${roomId}/images`)
      .set('Authorization', otherAdminToken)
      .attach('file', Buffer.from('fake-image-bytes'), { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(403);
  });

  it('egasi ADMIN rasm yuklaydi -> 200, URL qaytadi va room.images da saqlanadi', async () => {
    const res = await api()
      .post(`/api/rooms/${roomId}/images`)
      .set('Authorization', ownerToken)
      .attach('file', Buffer.from('fake-image-bytes'), { filename: 'cover.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/^\/uploads\/rooms\//);

    const updated = await prisma.computerRoom.findUnique({ where: { id: roomId } });
    const images: string[] = (updated!.images as string[]) || [];
    expect(images).toContain(res.body.data.url);
  });

  it('noto\'g\'ri fayl turi (MIME) rad etiladi -> 400 (server validatsiyasi)', async () => {
    const res = await api()
      .post(`/api/rooms/${roomId}/images`)
      .set('Authorization', ownerToken)
      .attach('file', Buffer.from('body'), { filename: 'evil.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('ega ADMIN rasmni o\'chira oladi -> 200', async () => {
    const up = await api()
      .post(`/api/rooms/${roomId}/images`)
      .set('Authorization', ownerToken)
      .attach('file', Buffer.from('fake-image-bytes'), { filename: 'del.jpg', contentType: 'image/jpeg' });
    const url = up.body.data.url;

    const del = await api().delete(`/api/rooms/${roomId}/images`).set('Authorization', ownerToken).send({ url });
    expect(del.status).toBe(200);
    const updated = await prisma.computerRoom.findUnique({ where: { id: roomId } });
    expect((updated!.images as string[]) || []).not.toContain(url);
  });

  it('USER admin bronlar ro\'yxatini ko\'ra olmaydi -> 403; ADMIN -> 200', async () => {
    const userAccess = await api().get('/api/bookings/admin/bookings').set('Authorization', userToken);
    expect(userAccess.status).toBe(403);

    const adminAccess = await api().get('/api/bookings/admin/bookings').set('Authorization', ownerToken);
    expect(adminAccess.status).toBe(200);
  });

  it('to\'lovlar boshqaruvi: USER va ADMIN rad etiladi, faqat SUPER_ADMIN -> 200', async () => {
    const u = await api().get('/api/payments').set('Authorization', userToken);
    expect(u.status).toBe(403);
    const a = await api().get('/api/payments').set('Authorization', ownerToken);
    expect(a.status).toBe(403);
    const s = await api().get('/api/payments').set('Authorization', superAdminToken);
    expect(s.status).toBe(200);
  });
});