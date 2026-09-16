import Redis from 'ioredis';

const url = process.env.REDIS_URL || 'redis://localhost:6380';

export const redis = new Redis(url, {
  maxRetriesPerRequest: 2,
  lazyConnect: true,
  reconnectOnError: () => false,
});

redis.on('error', (err) => {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[REDIS] ulanish xatosi (caching o\'chirilgan):', err.message);
  }
});

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    if (redis.status !== 'ready') return null;
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSec = 60): Promise<void> {
  try {
    if (redis.status !== 'ready') return;
    await redis.set(key, JSON.stringify(value), 'EX', ttlSec);
  } catch {
    /* ignore */
  }
}

export async function cacheDel(pattern: string): Promise<void> {
  try {
    if (redis.status !== 'ready') return;
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  } catch {
    /* ignore */
  }
}

export { redis as redisClient };