const bcrypt = require('bcrypt')

async function routes(fastify, options) {
  // Đăng ký người dùng
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
          fullName: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { username, password, fullName } = request.body
    
    // Kiểm tra username đã tồn tại
    if (fastify.db.data.users.find(u => u.username === username)) {
      return reply.code(400).send({ error: 'Username đã tồn tại' })
    }
    
    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10)
    
    // Tạo người dùng mới
    const user = {
      id: Date.now().toString(36),
      username,
      password: hashedPassword,
      fullName: fullName || username,
      createdAt: new Date().toISOString()
    }
    
    fastify.db.data.users.push(user)
    await fastify.db.write()
    
    // Trả về token
    const { password: _, ...userWithoutPassword } = user
    const token = fastify.jwt.sign(userWithoutPassword)
    
    return { user: userWithoutPassword, token }
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
    
    // Tìm người dùng
    const user = fastify.db.data.users.find(u => u.username === username)
    if (!user) {
      return reply.code(401).send({ error: 'Thông tin đăng nhập không đúng' })
    }
    
    // Kiểm tra mật khẩu
    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return reply.code(401).send({ error: 'Thông tin đăng nhập không đúng' })
    }
    
    // Tạo và trả về token
    const { password: _, ...userWithoutPassword } = user
    const token = fastify.jwt.sign(userWithoutPassword)
    
    return { user: userWithoutPassword, token }
  })
}

module.exports = routes