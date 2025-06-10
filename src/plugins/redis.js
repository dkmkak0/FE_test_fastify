import fp from 'fastify-plugin';
import { createClient } from 'redis';

export default fp(async (fastify, opts) => {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        console.log('No Redis URL - using no-op cache');
        fastify.decorate('cache', {
            async get(key) { return null; },
            async set(key, value, ttl = 3600) { return true; },
            async del(key) { return true; },
            async delByPrefix(prefix) { return true; },
            async clear() { return true; },
            async exists(key) { return false; }
        });
        return;
    };

    // ✅ Tạo Redis client đơn giản:
    const redisClient = createClient({
        url: redisUrl,
        socket: {
            tls: true,
            rejectUnauthorized: false,
            connectTimeout: 8000,
            commandTimeout: 3000,
        }
    });
    // xử lý sự kiện kết nối
    redisClient.on('error', (err) => {
        console.error('Redis Client Error', err);
    });
    redisClient.on('connect', () => {
        console.log('Redis client connected successfully');
    });
    redisClient.on('ready', () => {
        console.log('Redis client is ready');
    });
    redisClient.on('end', () => {
        fastify.log.warn('Redis connection ended');
        isConnected = false;
    });

    try {
        await redisClient.connect();
        console.log('Redis ready to use');
    } catch (err) {
        console.warn('Redis connection failed:', err.message);
        // ✅ Fallback to no-op cache:
        fastify.decorate('cache', {
            async get(key) { return null; },
            async set(key, value, ttl = 3600) { return true; },
            async del(key) { return true; },
            async delByPrefix(prefix) { return true; },
            async clear() { return true; },
            async exists(key) { return false; }
        });
        return;
    }
    // Kết nối đến Redis server
    // Đăng ký Redis client vào Fastify
    fastify.decorate('redis', redisClient);

    //tạo helper methods cho cache
    fastify.decorate('cache', {
        async get(key) {
            const data = await fastify.redis.get(key);
            if(!data) {
                return null; // Trả về null nếu không tìm thấy
            }
            return JSON.parse(data); // Giả sử dữ liệu được lưu dưới dạng JSON
        },
        
        async set(key, value, ttl = 360) { // TTL mặc định là 3600 giây (1 giờ)
            await redisClient.set(key, JSON.stringify(value), {
                EX: ttl // Thời gian sống của cache
            })
        },

        async del(key) {
            await redisClient.del(key);
        },

        async delByPrefix(prefix) {
            //lấy tất cả keys theo prefix
            const keys = await redisClient.keys(`${prefix}*`);
            if(keys.length > 0) {
                await redisClient.del(keys);
            }
        },

        async clear() {
            // Xóa toàn bộ cache
            const keys = await redisClient.keys('*');
            if(keys.length > 0) {
                await redisClient.del(keys);
            }
        },

        async exists(key) {
            return await redisClient.exists(key) === 1; // Trả về true nếu key tồn tại
        },
    });
    // Đóng kết nối Redis khi Fastify đóng
    fastify.addHook('onClose', async (fastifyInstance, done) => {
        try {
            await redisClient.quit();
            console.log('Redis client disconnected');
        } catch (err) {
            console.error('Error disconnecting Redis client:', err);
        }
        done();
    });

});