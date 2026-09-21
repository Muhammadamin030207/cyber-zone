import { describe, it, expect, beforeAll } from 'vitest';
import { api, resetDb, auth, loginViaApi, registerViaApi, prisma } from './helpers';

describe('E2E: AI assistant — ownership, history, edit/delete/regenerate, streaming', () => {
  let tokenA = '';
  let tokenB = '';
  let convId = '';

  beforeAll(async () => {
    await resetDb();
    const a = await registerViaApi('ai-a@e2e.test', 'secret123', 'AI User A');
    const b = await registerViaApi('ai-b@e2e.test', 'secret123', 'AI User B');
    tokenA = a.body.data.accessToken;
    tokenB = b.body.data.accessToken;
  });

  it('chat: autentifikatsiyasiz 401, autentifikatsiya bilan javob beradi', async () => {
    const noAuth = await api().post('/api/ai/chat').send({ message: 'salom' });
    expect(noAuth.status).toBe(401);

    const res = await api().post('/api/ai/chat').set('Authorization', auth(tokenA)).send({ message: 'salom' });
    expect(res.status).toBe(200);
    expect(typeof res.body.data.reply).toBe('string');
    expect(res.body.data.reply.length).toBeGreaterThan(0);
  });

  it('yangi suhbat yaratiladi va ro\'yxatda ko\'rinadi (faqat egasiga)', async () => {
    const create = await api().post('/api/ai/conversations').set('Authorization', auth(tokenA)).send({});
    expect(create.status).toBe(201);
    convId = create.body.data.id;
    expect(convId).toBeTruthy();

    const listA = await api().get('/api/ai/conversations').set('Authorization', auth(tokenA));
    expect((listA.body.data as any[]).some((c) => c.id === convId)).toBe(true);

    const listB = await api().get('/api/ai/conversations').set('Authorization', auth(tokenB));
    expect((listB.body.data as any[]).some((c) => c.id === convId)).toBe(false);
  });

  it('xabar yuboriladi, tarix saqlanadi va sarlavha avtomatik yangilanadi', async () => {
    const res = await api()
      .post(`/api/ai/conversations/${convId}/messages`)
      .set('Authorization', auth(tokenA))
      .send({ message: 'Xonalar narxi qancha?' });
    expect(res.status).toBe(200);
    expect(res.body.data.userMessage.role).toBe('user');
    expect(res.body.data.assistantMessage.role).toBe('assistant');

    const get = await api().get(`/api/ai/conversations/${convId}`).set('Authorization', auth(tokenA));
    expect(get.status).toBe(200);
    expect(get.body.data.messages.length).toBe(2);

    const conv = await prisma.aIConversation.findUnique({ where: { id: convId } });
    expect(conv!.title).not.toBe('Yangi suhbat');
  });

  it('bo\'sh xabar rad etiladi (400)', async () => {
    const res = await api().post(`/api/ai/conversations/${convId}/messages`).set('Authorization', auth(tokenA)).send({ message: '   ' });
    expect(res.status).toBe(400);
  });

  it('STREAMING: SSE orqali assistant javobi va done event keladi', async () => {
    const res = await api()
      .post(`/api/ai/conversations/${convId}/messages`)
      .set('Authorization', auth(tokenA))
      .set('Accept', 'text/event-stream')
      .send({ message: 'Ish vaqti qanday?' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('"type":"assistant"');
    expect(res.text).toContain('"type":"done"');
  });

  it('OWNERSHIP: B A ning suhbatini o\'qiy/tahrirlay/o\'chira olmaydi (403)', async () => {
    const get = await api().get(`/api/ai/conversations/${convId}`).set('Authorization', auth(tokenB));
    expect(get.status).toBe(403);

    const rename = await api().patch(`/api/ai/conversations/${convId}`).set('Authorization', auth(tokenB)).send({ title: 'Hacked' });
    expect(rename.status).toBe(403);

    const send = await api().post(`/api/ai/conversations/${convId}/messages`).set('Authorization', auth(tokenB)).send({ message: 'salom' });
    expect(send.status).toBe(403);

    const del = await api().delete(`/api/ai/conversations/${convId}`).set('Authorization', auth(tokenB));
    expect(del.status).toBe(403);
  });

  it('OWNERSHIP: B A ning xabarini tahrirlay/o\'chira/regenerate qila olmaydi (403)', async () => {
    const conv = await prisma.aIConversation.findUnique({ where: { id: convId }, include: { messages: true } });
    const userMsg = conv!.messages.find((m) => m.role === 'user')!;
    const assistantMsg = conv!.messages.find((m) => m.role === 'assistant')!;

    const edit = await api().patch(`/api/ai/messages/${userMsg.id}`).set('Authorization', auth(tokenB)).send({ content: 'hack' });
    expect(edit.status).toBe(403);

    const del = await api().delete(`/api/ai/messages/${userMsg.id}`).set('Authorization', auth(tokenB));
    expect(del.status).toBe(403);

    const regen = await api().post(`/api/ai/messages/${assistantMsg.id}/regenerate`).set('Authorization', auth(tokenB)).send({});
    expect(regen.status).toBe(403);
  });

  it('edit: user xabari tahrirlanadi, keyingi javoblar qayta yaratiladi', async () => {
    const conv = await prisma.aIConversation.findUnique({ where: { id: convId }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    const firstUser = conv!.messages.find((m) => m.role === 'user')!;

    const res = await api().patch(`/api/ai/messages/${firstUser.id}`).set('Authorization', auth(tokenA)).send({ content: 'Yangi savol matni' });
    expect(res.status).toBe(200);
    expect(res.body.data.editedMessage.content).toBe('Yangi savol matni');

    const after = await api().get(`/api/ai/conversations/${convId}`).set('Authorization', auth(tokenA));
    const msgs = after.body.data.messages as any[];
    expect(msgs.length).toBe(2);
    expect(msgs[0].content).toBe('Yangi savol matni');
    expect(msgs[1].role).toBe('assistant');
  });

  it('regenerate: assistant javobi yangilanadi', async () => {
    const conv = await prisma.aIConversation.findUnique({ where: { id: convId }, include: { messages: true } });
    const assistant = conv!.messages.find((m) => m.role === 'assistant')!;
    const res = await api().post(`/api/ai/messages/${assistant.id}/regenerate`).set('Authorization', auth(tokenA)).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.assistantMessage.id).toBe(assistant.id);
  });

  it('delete message: xabar va keyingilari o\'chiriladi', async () => {
    const conv = await prisma.aIConversation.findUnique({ where: { id: convId }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    const firstUser = conv!.messages.find((m) => m.role === 'user')!;
    const before = conv!.messages.length;

    const res = await api().delete(`/api/ai/messages/${firstUser.id}`).set('Authorization', auth(tokenA));
    expect(res.status).toBe(200);

    const after = await api().get(`/api/ai/conversations/${convId}`).set('Authorization', auth(tokenA));
    expect((after.body.data.messages as any[]).length).toBeLessThan(before);
  });

  it('delete conversation: egasi o\'chiradi, DB\'dan yo\'qoladi', async () => {
    const res = await api().delete(`/api/ai/conversations/${convId}`).set('Authorization', auth(tokenA));
    expect(res.status).toBe(200);
    const gone = await prisma.aIConversation.findUnique({ where: { id: convId } });
    expect(gone).toBeNull();
  });
});
