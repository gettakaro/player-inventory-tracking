const { createClient } = require('redis');

// Cache TTLs in seconds
const TTL = {
  GAME_SERVERS: 15 * 60,      // 15 minutes
  MAP_INFO: 60 * 60,          // 1 hour
  PLAYER_NAMES: 5 * 60,       // 5 minutes
  PLAYERS_LIST: 30,           // 30 seconds (for auto-refresh)
  MOVEMENT_PATHS: 5 * 60,     // 5 minutes
  DEATH_EVENTS: 10 * 60,      // 10 minutes
  AREA_SEARCH: 2 * 60,        // 2 minutes
};

class Cache {
  constructor() {
    this.redis = null;
    this.connected = false;
    this.memoryCache = new Map();
    this.memoryCacheTTL = new Map();
  }

  async connect() {
    try {
      this.redis = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });

      this.redis.on('error', (err) => {
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
      console.warn('Redis not available, using in-memory cache:', error.message);
      this.connected = false;
      return false;
    }
  }

  // Generate cache key
  key(prefix, ...parts) {
    return `takaro:${prefix}:${parts.join(':')}`;
  }

  // Get from cache
  async get(key) {
    const start = Date.now();
    try {
      if (this.connected && this.redis) {
        const value = await this.redis.get(key);
        if (value) {
          console.log(`  ⚡ CACHE HIT: ${key} (${Date.now() - start}ms)`);
          return JSON.parse(value);
        }
      } else {
        // Memory cache fallback
        const entry = this.memoryCache.get(key);
        if (entry) {
          const ttl = this.memoryCacheTTL.get(key);
          if (ttl && Date.now() < ttl) {
            console.log(`  ⚡ MEM CACHE HIT: ${key} (${Date.now() - start}ms)`);
            return entry;
          } else {
            // Expired
            this.memoryCache.delete(key);
            this.memoryCacheTTL.delete(key);
          }
        }
      }
    } catch (error) {
      console.warn(`Cache get error for ${key}:`, error.message);
    }
    return null;
  }

  // Set in cache
  async set(key, value, ttlSeconds) {
    try {
      if (this.connected && this.redis) {
        await this.redis.setEx(key, ttlSeconds, JSON.stringify(value));
      } else {
        // Memory cache fallback
        this.memoryCache.set(key, value);
        this.memoryCacheTTL.set(key, Date.now() + (ttlSeconds * 1000));
      }
    } catch (error) {
      console.warn(`Cache set error for ${key}:`, error.message);
    }
  }

  // Delete from cache
  async del(key) {
    try {
      if (this.connected && this.redis) {
        await this.redis.del(key);
      } else {
        this.memoryCache.delete(key);
        this.memoryCacheTTL.delete(key);
      }
    } catch (error) {
      console.warn(`Cache del error for ${key}:`, error.message);
    }
  }

  // Delete by pattern (for invalidation)
  async delPattern(pattern) {
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
      console.warn(`Cache delPattern error for ${pattern}:`, error.message);
    }
  }

  // Wrap an async function with caching
  wrap(keyFn, ttlSeconds, fn) {
    return async (...args) => {
      const key = typeof keyFn === 'function' ? keyFn(...args) : keyFn;

      // Try cache first
      const cached = await this.get(key);
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
  async stats() {
    if (this.connected && this.redis) {
      const info = await this.redis.info('stats');
      return { type: 'redis', info };
    }
    return {
      type: 'memory',
      keys: this.memoryCache.size
    };
  }
}

// Singleton instance
const cache = new Cache();

module.exports = {
  cache,
  TTL
};
