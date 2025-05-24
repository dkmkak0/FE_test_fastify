import fp from 'fastify-plugin';
import fastifyCache from 'fastify-cache';

export default fp(async (fastify, options) => {
  fastify.register(fastifyCache, {
    expiresIn: options.ttl || 300 // TTL mặc định là 5 phút (300 giây)
  });
});