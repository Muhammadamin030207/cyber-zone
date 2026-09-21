import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { ok, badRequest, forbidden, notFoundMsg } from '../utils/response';
import { generateAIReply, conversationToHistory } from './ai.controller';

// ============================================================================
// AI SUHBAT TARIXI (conversations / messages)
// - Har bir conversation egasiga tegishli — ownership tekshirish majburiy.
// - Gemini javoblar DB'da saqlanadi (AIConversation/AIMessage).
// - Streaming: `POST /messages` — SSE yoki oddiy JSON (Accept: text/event-stream).
// ============================================================================

// ---------- Conversation ownership helper ----------
async function getOwnedConversation(userId: string, conversationId: string) {
  const conversation = await prisma.aIConversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: { orderBy: { createdAt: 'asc' }, take: 200 },
    },
  });
  if (!conversation) return null;
  if (conversation.userId !== userId) return { forbidden: true, conversation: null as any };
  return { forbidden: false, conversation };
}

function conflict(res: Response, msg: string) {
  return res.status(409).json({ success: false, message: msg });
}

async function getOwnedMessage(userId: string, messageId: string) {
  const message = await prisma.aIMessage.findUnique({
    where: { id: messageId },
    include: { conversation: { select: { id: true, userId: true } } },
  });
  if (!message) return null;
  if (message.conversation.userId !== userId) return { message: null as any, forbidden: true };
  return { message, forbidden: false };
}

// ============ GET /api/ai/conversations (auth) — suhbatlar ro'yxati ============
export async function listConversations(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const conversations = await prisma.aIConversation.findMany({
      where: { userId: req.user!.userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, role: true },
        },
        _count: { select: { messages: true } },
      },
    });
    const normalized = conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
      lastMessage: c.messages[0]?.content?.slice(0, 120) || '',
    }));
    return ok(res, normalized);
  } catch (err) {
    _next(err);
  }
}

// ============ POST /api/ai/conversations (auth) — yangi suhbat ============
export async function createConversation(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const title = String(req.body?.title || 'Yangi suhbat').slice(0, 60);
    const conversation = await prisma.aIConversation.create({
      data: { userId: req.user!.userId, title: title.trim() || 'Yangi suhbat' },
    });
    return res.status(201).json({ success: true, message: 'Yangi suhbat yaratildi', data: conversation });
  } catch (err) {
    _next(err);
  }
}

// ============ GET /api/ai/conversations/:id (auth) — tarix + xabarlar ============
export async function getConversation(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const owns = await getOwnedConversation(req.user!.userId, req.params.id);
    if (!owns) return notFoundMsg(res, 'Suhbat topilmadi');
    if (owns.forbidden) return forbidden(res, 'Sizga ruxsat berilmagan');
    return ok(res, owns.conversation);
  } catch (err) {
    _next(err);
  }
}

// ============ PATCH /api/ai/conversations/:id (auth) — nomini o'zgartirish ============
export async function renameConversation(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const owns = await getOwnedConversation(req.user!.userId, req.params.id);
    if (!owns) return notFoundMsg(res, 'Suhbat topilmadi');
    if (owns.forbidden) return forbidden(res, 'Sizga ruxsat berilmagan');

    const title = String(req.body?.title || '').slice(0, 60).trim();
    if (!title) return badRequest(res, 'Suhbat nomi bosh bo\'lishi mumkin emas');

    await prisma.aIConversation.update({ where: { id: req.params.id }, data: { title } });
    return ok(res, { title }, 'Suhbat nomi yangilandi');
  } catch (err) {
    _next(err);
  }
}

// ============ DELETE /api/ai/conversations/:id (auth) — o'chirish ============
export async function deleteConversation(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const owns = await getOwnedConversation(req.user!.userId, req.params.id);
    if (!owns) return notFoundMsg(res, 'Suhbat topilmadi');
    if (owns.forbidden) return forbidden(res, 'Sizga ruxsat berilmagan');

    await prisma.aIConversation.delete({ where: { id: req.params.id } });
    return ok(res, null, 'Suhbat o\'chirildi');
  } catch (err) {
    _next(err);
  }
}

// ============ POST /api/ai/conversations/:id/messages (auth) — xabar yuborish ============
// Accept: text/event-stream → SSE (real-time streaming). Oddiy JSON → to'liq javob.
export async function sendMessage(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const owns = await getOwnedConversation(req.user!.userId, req.params.id);
    if (!owns) return notFoundMsg(res, 'Suhbat topilmadi');
    if (owns.forbidden) return forbidden(res, 'Sizga ruxsat berilmagan');

    const { conversation } = owns;
    const message = String(req.body?.message || '').trim().slice(0, 500);
    if (!message) return badRequest(res, 'Xabar bo\'sh bo\'lishi mumkin emas');

    // History: faqat o'chirilmagan xabarlardan (assistant/user juft algoritm saqlanadi)
    const history = conversationToHistory(conversation.messages);

    // 1) user xabarini saqlash
    const userMessage = await prisma.aIMessage.create({
      data: { conversationId: conversation.id, role: 'user', content: message },
    });

    const wantsStream = String(req.headers.accept || '').includes('text/event-stream');

    // 2) AI javobini olish
    const { reply, model } = await generateAIReply(req.user!.userId, message, history);

    // 3) assistant javobini saqlash
    const assistantMessage = await prisma.aIMessage.create({
      data: { conversationId: conversation.id, role: 'assistant', content: reply.slice(0, 4000) },
    });

    // Auto-title: birinchi xabar bo'lsa suhbat nomini qisqa gapga o'zgartiramiz
    if (conversation.title === 'Yangi suhbat') {
      await prisma.aIConversation.update({
        where: { id: conversation.id },
        data: { title: message.slice(0, 40) || 'Yangi suhbat' },
      });
    }

    await prisma.aIConversation.update({ where: { id: conversation.id }, data: {} }); // touch -> updatedAt

    if (wantsStream) {
      // SSE — faqat real-time (keyin o'chirishni to'xtatib qo'yish)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      // Oddiy bo'lmagan chunk: assambleya qilish noqulay bo'lgani uchun, to'liq javobni
      // bitta event sifatida, keyin end event. (Gemini streamga obuna bo'lish uchun
      // alohida integration qilinadi — bu esa haqiqiy token tokken stream beradi.)
      res.write(`data: ${JSON.stringify({ type: 'assistant', model, id: assistantMessage.id, content: reply })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      return res.end();
    }

    return ok(
      res,
      {
        userMessage,
        assistantMessage,
        model,
      },
      'Xabar yuborildi'
    );
  } catch (err) {
    _next(err);
  }
}

// ============ PATCH /api/ai/messages/:id (auth) — user xabarini tahrirlash ============
// Keyingi assistant javoblari ham yangilanadi: bu xabardan keyingi hammasi o'chiriladi,
// so'ng yangi javob generatsiya qilinadi.
export async function editMessage(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const owns = await getOwnedMessage(req.user!.userId, req.params.id);
    if (!owns) return notFoundMsg(res, 'Xabar topilmadi');
    if (owns.forbidden) return forbidden(res, 'Sizga ruxsat berilmagan');
    const { message } = owns;

    if (message.role !== 'user') return badRequest(res, 'FAQAT foydalanuvchi xabari tahrirlanishi mumkin');

    const newContent = String(req.body?.content || '').trim().slice(0, 500);
    if (!newContent) return badRequest(res, 'Xabar bo\'sh bo\'lishi mumkin emas');

    const conversation = await prisma.aIConversation.findUnique({
      where: { id: message.conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    // 1) user xabari yangilanadi
    await prisma.aIMessage.update({ where: { id: message.id }, data: { content: newContent } });

    // 2) bu xabardan KEYIN kelgan barcha xabarlar o'chiriladi (yangi ping).
    //    Index asosida — bir xil createdAt bo'lsa ham ketma-ketlik buzilmaydi.
    const allMessages = conversation?.messages || [];
    const editedIndex = allMessages.findIndex((m) => m.id === message.id);
    const laterMessages = editedIndex >= 0 ? allMessages.slice(editedIndex + 1) : [];
    if (laterMessages.length) {
      await prisma.aIMessage.deleteMany({
        where: { id: { in: laterMessages.map((m) => m.id) } },
      });
    }

    // 3) yangi javob (tahrirlangan xabardan oldingi tarix saqlanadi)
    const retained = editedIndex >= 0 ? allMessages.slice(0, editedIndex) : [];
    const history = conversationToHistory(retained);
    const { reply, model } = await generateAIReply(req.user!.userId, newContent, history);

    const assistantMessage = await prisma.aIMessage.create({
      data: { conversationId: message.conversationId, role: 'assistant', content: reply.slice(0, 4000) },
    });

    return ok(res, { editedMessage: { id: message.id, content: newContent }, assistantMessage, model }, 'Xabar tahrirlandi');
  } catch (err) {
    _next(err);
  }
}

// ============ DELETE /api/ai/messages/:id (auth) — xabarni o'chirish ============
// Handle: faqat assistant javobini o'chirish — keyingi javoblarni saqlanadi.
// user xabarini o'chirish — keyingi assistant javoblari bloklanadi tarzda.
export async function deleteMessage(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const owns = await getOwnedMessage(req.user!.userId, req.params.id);
    if (!owns) return notFoundMsg(res, 'Xabar topilmadi');
    if (owns.forbidden) return forbidden(res, 'Sizga ruxsat berilmagan');
    const { message } = owns;

    // Bu xabardan KEYIN kelgan hamma narsa o'chiriladi (suhbat ketma-ketligi saqlanadi)
    const conversation = await prisma.aIConversation.findUnique({
      where: { id: message.conversationId },
      include: { messages: { where: { createdAt: { gte: message.createdAt } }, select: { id: true } } },
    });
    const toDelete = conversation?.messages.filter((m) => m.id !== message.id).map((m) => m.id) || [];
    if (toDelete.length) {
      await prisma.aIMessage.deleteMany({ where: { id: { in: toDelete } } });
    }
    await prisma.aIMessage.delete({ where: { id: message.id } });

    return ok(res, { deletedId: message.id }, 'Xabar o\'chirildi');
  } catch (err) {
    _next(err);
  }
}

// ============ POST /api/ai/messages/:id/regenerate (auth) — qayta generatsiya ============
// Oxirgi assistant javobini yangi generatsiya bilan almashtiradi.
export async function regenerateMessage(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const owns = await getOwnedMessage(req.user!.userId, req.params.id);
    if (!owns) return notFoundMsg(res, 'Xabar topilmadi');
    if (owns.forbidden) return forbidden(res, 'Sizga ruxsat berilmagan');
    const { message } = owns;

    if (message.role !== 'assistant') return badRequest(res, 'FAQAT assistant javobi qayta generatsiya qilinadi');

    const conversation = await prisma.aIConversation.findUnique({
      where: { id: message.conversationId },
      include: { messages: { where: { createdAt: { lt: message.createdAt } }, orderBy: { createdAt: 'asc' } } },
    });

    const history = conversationToHistory(conversation?.messages || []);
    const lastUserMsg = [...(conversation?.messages || [])].reverse().find((m) => m.role === 'user');
    const prompt = lastUserMsg?.content?.slice(0, 500) || 'Davom etish haqida yoz';

    const { reply, model } = await generateAIReply(req.user!.userId, prompt, history);

    await prisma.aIMessage.update({
      where: { id: message.id },
      data: { content: reply.slice(0, 4000) },
    });

    return ok(res, { assistantMessage: { id: message.id, content: reply }, model }, 'Javob yangilandi');
  } catch (err) {
    _next(err);
  }
}