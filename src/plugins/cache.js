import fp from 'fastify-plugin';
import caching from '@fastify/caching';

export default fp(async (fastify, options) => {
  fastify.register(caching, {
    privacy: 'private',
    expiresIn: options.expiresIn || 300000 // 5 phút
  });
});