import fp from 'fastify-plugin';

export default fp(async (fastify, options) => {
  // Tạo một Map để lưu trữ cache
  const cache = new Map();
  const ttl = options.expiresIn || 300; // TTL mặc định 5 phút (300 giây)

  // Decorators cho fastify để sử dụng cache
  fastify.decorate('cache', {
    get: async (key) => {
      const entry = cache.get(key);
      if (!entry) return null;
      // Kiểm tra nếu cache đã hết hạn
      if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
      }
      return entry.value;
    },
    set: async (key, value) => {
      cache.set(key, {
        value,
        expiresAt: Date.now() + ttl * 1000 // Tính thời gian hết hạn
      });
    },
    del: async (key) => {
      cache.delete(key);
    }
  });

  // Tự động dọn dẹp cache hết hạn mỗi phút
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
      if (entry.expiresAt < now) {
        cache.delete(key);
      }
    }
  }, 60000); // Chạy mỗi 60 giây
});