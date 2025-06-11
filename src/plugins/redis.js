import fp from 'fastify-plugin';
import Redis from 'ioredis';

export default fp(async (fastify, opts) => {
    const redis = new Redis(process.env.REDIS_URL, {
        // ✅ Azure optimized settings
        connectTimeout: 10000,       // 10s connect timeout
        lazyConnect: true,           // Connect on first command
        maxRetriesPerRequest: 3,     // Retry failed requests
        retryDelayOnFailover: 100,   // Retry delay
        
        // ✅ Keep-alive settings for Azure
        keepAlive: 30000,            // 30s keep-alive
        family: 4,                   // Force IPv4
        
        // ✅ Reconnection strategy
        retryDelayOnReconnect: function (times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        
        // ✅ Connection recovery
        maxRetriesPerRequest: null,  // Disable request retry limit
        reconnectOnError: function (err) {
            const targetError = 'READONLY';
            return err.message.includes(targetError);
        }
    });

    // ✅ Xử lý sự kiện kết nối - dùng fastify.log nhất quán
    redis.on('error', (err) => {
        fastify.log.error('Redis Client Error', err);
    });
    
    redis.on('connect', () => {
        fastify.log.info('Redis client connected successfully');
    });
    
    redis.on('ready', () => {
        fastify.log.info('Redis client is ready');
    });
    
    redis.on('end', () => {
        fastify.log.warn('Redis connection ended');
    });
    
    redis.on('reconnecting', () => {
        fastify.log.info('Redis client reconnecting');
    });

    // ✅ Periodic ping to keep connection alive
    const keepAliveInterval = setInterval(async () => {
        try {
            await redis.ping();
            fastify.log.debug('Redis ping successful');
        } catch (error) {
            fastify.log.error('Redis ping failed:', error.message);
        }
    }, 4 * 60 * 1000); // Every 4 minutes

    // ✅ Đăng ký Redis client vào Fastify
    fastify.decorate('redis', redis);

    // ✅ Tạo helper methods cho cache - SỬA TẤT CẢ SYNTAX ERRORS
    fastify.decorate('cache', {
        async get(key) {
            try {
                const data = await fastify.redis.get(key);
                if (!data) {
                    return null;
                }
                return JSON.parse(data);
            } catch (error) {
                fastify.log.error('Cache get error:', error.message);
                return null;
            }
        },
        
        async set(key, value, ttl = 3600) { // ✅ Sửa TTL default
            try {
                // ✅ SỬA: Dùng string syntax thay vì object
                await fastify.redis.set(key, JSON.stringify(value), 'EX', ttl);
            } catch (error) {
                fastify.log.error('Cache set error:', error.message);
            }
        },

        async del(key) {
            try {
                await fastify.redis.del(key);
            } catch (error) {
                fastify.log.error('Cache del error:', error.message);
            }
        },

        async delByPrefix(prefix) {
            try {
                const keys = await fastify.redis.keys(`${prefix}*`);
                if (keys.length > 0) {
                    // ✅ SỬA: Dùng spread operator
                    await fastify.redis.del(...keys);
                }
            } catch (error) {
                fastify.log.error('Cache delByPrefix error:', error.message);
            }
        },

        async clear() {
            try {
                const keys = await fastify.redis.keys('*');
                if (keys.length > 0) {
                    // ✅ SỬA: Dùng spread operator
                    await fastify.redis.del(...keys);
                }
            } catch (error) {
                fastify.log.error('Cache clear error:', error.message);
            }
        },

        async exists(key) {
            try {
                return await fastify.redis.exists(key) === 1;
            } catch (error) {
                fastify.log.error('Cache exists error:', error.message);
                return false;
            }
        }
    });

    // ✅ Đóng kết nối Redis khi Fastify đóng
    fastify.addHook('onClose', async (fastifyInstance) => {
        try {
            clearInterval(keepAliveInterval);
            await redis.quit(); // ✅ Chỉ dùng quit(), bỏ disconnect()
            fastify.log.info('Redis connection closed gracefully');
        } catch (err) {
            fastify.log.error('Error closing Redis connection:', err.message);
        }
    });
});