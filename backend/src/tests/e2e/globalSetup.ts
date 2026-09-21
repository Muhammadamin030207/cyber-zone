import { execSync } from 'child_process';

// Vitest globalSetup — bir marta ishlaydi. E2E DB'ga migratsiyalarni qo'llaydi.
export default function globalSetup() {
  const url =
    process.env.E2E_DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5433/cyber_zone_e2e?schema=public';

  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
