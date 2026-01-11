import { createClient, type RedisClientType } from 'redis';

// Cache TTLs in seconds
export const TTL = {
  GAME_SERVERS: 15 * 60, // 15 minutes
  MAP_INFO: 60 * 60, // 1 hour
  PLAYER_NAMES: 5 * 60, // 5 minutes
  PLAYERS_LIST: 30, // 30 seconds (for auto-refresh)
  MOVEMENT_PATHS: 5 * 60, // 5 minutes
  DEATH_EVENTS: 10 * 60, // 10 minutes
  AREA_SEARCH: 2 * 60, // 2 minutes
} as const;

type CacheValue = unknown;

class Cache {
  private redis: RedisClientType | null = null;
  private connected = false;
  private memoryCache: Map<string, CacheValue> = new Map();
  private memoryCacheTTL: Map<string, number> = new Map();

  async connect(): Promise<boolean> {
    try {
      this.redis = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      });

      this.redis.on('error', () => {
        if (this.connected) {
          console.warn('Redis connection lost, falling back to memory cache');
          this.connected = false;
        }
      });

      this.redis.on('connect', () => {
        console.log('Redis connected');
        this.connected = true;
      });

      await this.redis.connect();
      this.connected = true;
      console.log('✓ Cache: Redis connected');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn('Redis not available, using in-memory cache:', errorMessage);
      this.connected = false;
      return false;
    }
  }

  // Generate cache key
  key(prefix: string, ...parts: string[]): string {
    return `takaro:${prefix}:${parts.join(':')}`;
  }

  // Get from cache
  async get<T = CacheValue>(key: string): Promise<T | null> {
    const start = Date.now();
    try {
      if (this.connected && this.redis) {
        const value = await this.redis.get(key);
        if (value) {
          console.log(`  ⚡ CACHE HIT: ${key} (${Date.now() - start}ms)`);
          return JSON.parse(value) as T;
        }
      } else {
        // Memory cache fallback
        const entry = this.memoryCache.get(key);
        if (entry !== undefined) {
          const ttl = this.memoryCacheTTL.get(key);
          if (ttl && Date.now() < ttl) {
            console.log(`  ⚡ MEM CACHE HIT: ${key} (${Date.now() - start}ms)`);
            return entry as T;
          } else {
            // Expired
            this.memoryCache.delete(key);
            this.memoryCacheTTL.delete(key);
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Cache get error for ${key}:`, errorMessage);
    }
    return null;
  }

  // Set in cache
  async set(key: string, value: CacheValue, ttlSeconds: number): Promise<void> {
    try {
      if (this.connected && this.redis) {
        await this.redis.setEx(key, ttlSeconds, JSON.stringify(value));
      } else {
        // Memory cache fallback
        this.memoryCache.set(key, value);
        this.memoryCacheTTL.set(key, Date.now() + ttlSeconds * 1000);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Cache set error for ${key}:`, errorMessage);
    }
  }

  // Delete from cache
  async del(key: string): Promise<void> {
    try {
      if (this.connected && this.redis) {
        await this.redis.del(key);
      } else {
        this.memoryCache.delete(key);
        this.memoryCacheTTL.delete(key);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Cache del error for ${key}:`, errorMessage);
    }
  }

  // Delete by pattern (for invalidation)
  async delPattern(pattern: string): Promise<void> {
    try {
      if (this.connected && this.redis) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(keys);
          console.log(`  Invalidated ${keys.length} cache keys matching ${pattern}`);
        }
      } else {
        // Memory cache: delete matching keys
        for (const key of this.memoryCache.keys()) {
          if (key.includes(pattern.replace('*', ''))) {
            this.memoryCache.delete(key);
            this.memoryCacheTTL.delete(key);
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Cache delPattern error for ${pattern}:`, errorMessage);
    }
  }

  // Wrap an async function with caching
  wrap<TArgs extends unknown[], TResult>(
    keyFn: ((...args: TArgs) => string) | string,
    ttlSeconds: number,
    fn: (...args: TArgs) => Promise<TResult>
  ): (...args: TArgs) => Promise<TResult> {
    return async (...args: TArgs): Promise<TResult> => {
      const key = typeof keyFn === 'function' ? keyFn(...args) : keyFn;

      // Try cache first
      const cached = await this.get<TResult>(key);
      if (cached !== null) {
        return cached;
      }

      // Execute function
      const result = await fn(...args);

      // Cache result
      if (result !== null && result !== undefined) {
        await this.set(key, result, ttlSeconds);
      }

      return result;
    };
  }

  // Get cache stats
  async stats(): Promise<{ type: string; info?: string; keys?: number }> {
    if (this.connected && this.redis) {
      const info = await this.redis.info('stats');
      return { type: 'redis', info };
    }
    return {
      type: 'memory',
      keys: this.memoryCache.size,
    };
  }
}

// Singleton instance
export const cache = new Cache();
