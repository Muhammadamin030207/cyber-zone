/**
 * MIGRATSIYA YAXUDAGI TEKSHIRUV (CI uchun).
 *
 * MUAMMO (2026-09-27 da topildi): `20260925143000_booking_approval_session_autoclose`
 * migratsiyasi `session_started_at` / `session_ended_at` ustunlariga murojaat
 * qilgan, lekin ularni qo'shuvchi migratsiya nomi bo'yicha KEYIN turgan
 * (`20260925143000_` < `20260925_` ASCII bo'yicha). Natija: BO'SH bazada
 * `prisma migrate deploy` FAIL bo'lardi — ya'ni yangi Render Postgres, staging
 * yoki DR nusxasini migratsiyalar orqali qayta qurib bo'lmasdi.
 *
 * BU SCRIPT:
 *   1) Mavjud .env DATABASE_URL dan VAQTINCHALIK skemani yaratadi
 *      (`_migcheck_<pid>`) — asl `public` skemasi tegilmaydi.
 *   2) Barcha migratsiyalarni shu skemaga qo'llaydi.
 *   3) Natijani `prisma/schema.prisma` bilan SOLISHTIRADI (drift = 0 bo'lishi
 *      kerak).
 *   4) Skemani O'CHIRADI (xato bo'lsa ham, `finally` orqali).
 *
 * ISHLATISH:  npm run test:migrations
 * XAVFSIZLIK: faqat `_migcheck_*` nomli skemani o'zgartiradi/o'chiradi.
 *            `public` skemasiga hech qanday DROP/TRUNCATE yuborilmaydi.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

function envFileValue(key: string): string | undefined {
  try {
    const raw = readFileSync('.env', 'utf8');
    const m = raw.match(new RegExp(`^${key}=["']?([^"'\\n]+)`, 'm'));
    return m?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const baseUrl =
  process.env.MIGRATION_CHECK_DATABASE_URL || envFileValue('DATABASE_URL') || process.env.DATABASE_URL;

if (!baseUrl) {
  console.error('❌ DATABASE_URL topilmadi (.env yoki MIGRATION_CHECK_DATABASE_URL).');
  process.exit(1);
}

const base = new URL(baseUrl);
const schema = `_migcheck_${process.pid}`;
const scoped = new URL(baseUrl);
scoped.pathname = base.pathname;
scoped.searchParams.set('schema', schema);
scoped.searchParams.delete('connection_limit');
scoped.searchParams.delete('pool_timeout');
scoped.searchParams.delete('connect_timeout');

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function main(): Promise<void> {
  let client: PrismaClient | null = null;
  try {
    // 1) skemani yaratish
    // pg'ga bog'liqlik qo'shmaslik uchun mavjud Prisma client'idan foydalanamiz.
    client = new PrismaClient({ datasources: { db: { url: base.toString() } } });
    await client.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    console.log(`🔍 Vaqtinchalik skema: ${schema}`);

    // 2) barcha migratsiyalarni qo'llash
    console.log('▶ Barcha migratsiyalar bo\'sh bazaga qo\'llanmoqda...');
    run('npx', ['prisma', 'migrate', 'deploy'], { DATABASE_URL: scoped.toString() });
    console.log('✅ Migratsiyalar muvaffaqiyatli qo\'llandi');

    // 3) drift tekshiruvi
    console.log('▶ Migratsiyalar ↔ prisma/schema.prisma solishtirilmoqda...');
    const diff = run(
      'npx',
      [
        'prisma',
        'migrate',
        'diff',
        '--from-migrations',
        'prisma/migrations',
        '--to-schema-datamodel',
        'prisma/schema.prisma',
        '--shadow-database-url',
        base.toString(),
      ],
      {},
    );

    if (diff.trim() && !diff.includes('No difference detected')) {
      console.error('❌ DRIFT ANIQLANDI — migratsiyalar va schema mos emas:\n');
      console.error(diff);
      process.exitCode = 1;
    } else {
      console.log('✅ Drift yo\'q: migratsiyalar va schema bir-biriga to\'liq mos');
    }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    console.error('❌ Migratsiya tekshiruvi muvaffaqiyatsiz:');
    if (e.stdout) console.error(e.stdout);
    if (e.stderr) console.error(e.stderr);
    else console.error(e.message);
    process.exitCode = 1;
  } finally {
    // 4) skemani har doim tozalash
    if (client) {
      try {
        await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        console.log(`🧹 ${schema} tozalandi`);
      } catch (err) {
        console.warn(`⚠️  Skemani tozalab bo'lmadi: ${(err as Error).message}`);
      }
      await client.$disconnect().catch(() => undefined);
    }
  }

  if (process.exitCode) {
    console.error('\nXULOSA: migratsiya tarixi BO\'SH bazada to\'liq qo\'llanmaydi.');
  } else {
    console.log('\nXULOSA: migratsiya tarixi to\'liq qayta quriladigan holatda ✅');
  }
}

main().catch((err) => {
  console.error('❌ kutilmagan xato:', err);
  process.exit(1);
});
