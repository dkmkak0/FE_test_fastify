import fp from 'fastify-plugin'

export default fp(async (fastify) => {
  fastify.register(import('@fastify/jwt'), {
    secret: process.env.JWT_SECRET || 'sach_secret',
    sign: {
      expiresIn: '24h'
    }
  })

  fastify.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      reply.code(401).send({ error: 'Không được phép truy cập' })
    }
  })
})
