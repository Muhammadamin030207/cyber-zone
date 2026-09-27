import { PrismaClient } from '@prisma/client';

/**
 * Postgres connection pool boshqaruvi.
 *
 * MUAMMO: Render'da `DATABASE_URL` odatda connection_limit'siz beriladi.
 * Prisma standart holda CPU soniga `2 + 1` connection oladi, lekin connection
 * limit Render free/standard plan'da juda kichik (odatda 5-20). Ko'p
 * request kelganda "too many clients already" (533/08006) xatosi butun API'ni
 * yiqilishiga olib keladi. Aksincha — connection limit juda katta bo'lsa,
 * Postgres connectionlari ko'p olinib qoladi va boshqa xizmatlar ulana olmaydi.
 *
 * YECHIM: limitni env'dan olamiz, standart qiymatni xavfsiz qilib qo'yamiz
 * (2 CPU -> 5 connection). Bu `pg` connection pool parametrini DATABASE_URL
 * parametriga qo'yish orqali amalga oshiriladi. Mavjud parametrlarni
 * qayta yozmaymiz — foydalanuvchi qo'lda boshqa qiymat bergan bo'lsa,
 * o'shandi saqlanadi.
 */
function buildDatabaseUrl(rawUrl: string, log: (msg: string) => void): string {
  const DEFAULTS = {
    // Render free: 0.25-0.5 CPU -> 2-3 connection. Standart: 2 CPU -> 5.
    connection_limit: process.env.PG_POOL_MAX || '5',
    // connection olish uzoq turmasin (Render connection limit'ini band qilmasin)
    connect_timeout: process.env.PG_CONNECT_TIMEOUT || '10',
    // connection bo'sh bo'lib turishi ma'nosiz — tezda qaytariladi
    pool_timeout: process.env.PG_POOL_TIMEOUT || '10',
  };

  try {
    const url = new URL(rawUrl);
    const missing: string[] = [];

    for (const [key, value] of Object.entries(DEFAULTS)) {
      if (!url.searchParams.has(key)) {
        url.searchParams.set(key, value);
        missing.push(`${key}=${value}`);
      }
    }

    if (missing.length) log(`[prisma] DATABASE_URL ga qo'shildi: ${missing.join(', ')}`);
    return url.toString();
  } catch {
    // URL parse bo'lmasa (gaiq bo'lmagan format) — asl qiymatni qoldiramiz
    return rawUrl;
  }
}

const poolNote = process.env.PG_POOL_MAX ? ` (PG_POOL_MAX=${process.env.PG_POOL_MAX})` : '';
const databaseUrl = buildDatabaseUrl(process.env.DATABASE_URL || '', (msg) =>
  console.warn(`${msg}${poolNote}`),
);

export const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
  log:
    process.env.PRISMA_LOG === 'query'
      ? ['query', 'warn', 'error']
      : process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
});

/**
 * Ikkala e'tibor berish:
 *  1) `connect_timeout` — Render Postgres "cold start"da 10-20s kutishi mumkin.
 *  2) Render web service `preStop`da SIGTERM yuboradi. U holda Prisma
 *     connectionlarni yopmaydi -> yangi deploy eski connectionlarni
 *     ushlab qoladi va Postgres connection limiti to'ladi. Shuning uchun
 *     `server.ts` dagi SIGTERM handler bu funksiyani chaqiradi.
 */
export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log('[prisma] Barcha DB connectionlar yopildi');
  } catch (err) {
    console.error('[prisma] Disconnect xatosi:', (err as Error).message);
  }
}

export default prisma;
