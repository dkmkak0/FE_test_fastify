export default async (fastify) => {
  // Đăng ký người dùng mới
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 3 },
          password: { type: 'string', minLength: 6 }
        }
      }
    }
  }, async (request, reply) => {
    const { username, password } = request.body
    
    // Kiểm tra xem username đã tồn tại chưa
    const existingUser = fastify.userModel.findByUsername(fastify.db, username)
    if (existingUser) {
      return reply.code(400).send({ error: 'Username đã tồn tại' })
    }
    
    const user = await fastify.userModel.create(fastify.db, { username, password })
    reply.code(201)
    return { user, message: 'Đăng ký thành công' }
  })
  
  // Đăng nhập
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { username, password } = request.body
    
    const user = fastify.userModel.findByUsername(fastify.db, username)
    if (!user) {
      return reply.code(401).send({ error: 'Thông tin đăng nhập không chính xác' })
    }
    
    const validPassword = await fastify.userModel.validatePassword(user, password)
    if (!validPassword) {
      return reply.code(401).send({ error: 'Thông tin đăng nhập không chính xác' })
    }
    
    // Tạo JWT token
    const token = fastify.jwt.sign(
      { id: user.id, username: user.username }
    )
    
    return {
      token,
      user: {
        id: user.id,
        username: user.username
      }
    }
  })
  
  // Lấy thông tin người dùng hiện tại
  fastify.get('/me', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    return request.user
  })
}
