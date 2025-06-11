import fp from 'fastify-plugin';
// import { createClient } from 'redis';
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
    // xử lý sự kiện kết nối
    redis.on('error', (err) => {
        console.error('Redis Client Error', err);
    });
    redis.on('connect', () => {
        console.log('Redis client connected successfully');
    });
    redis.on('ready', () => {
        console.log('Redis client is ready');
    });
    redis.on('end', () => {
        fastify.log.warn('Redis connection ended');
        isConnected = false;
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
   
    // Kết nối đến Redis server
    // Đăng ký Redis client vào Fastify
    fastify.decorate('redis', redis);

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
            clearInterval(keepAliveInterval);
            await redis.quit();
        redis.disconnect();

        } catch (err) {
            console.error('Error disconnecting Redis client:', err);
        }
        done();
    });

});