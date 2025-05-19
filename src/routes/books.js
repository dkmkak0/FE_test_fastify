export default async (fastify) => {
  // Lấy tất cả sách
  fastify.get('/books', async (request, reply) => {
    return fastify.db.data.books
  })
  
  // Lấy sách theo ID
  fastify.get('/books/:id', async (request, reply) => {
    const { id } = request.params
    const book = fastify.bookModel.getById(fastify.db, id)
    
    if (!book) {
      return reply.code(404).send({ error: 'Không tìm thấy sách' })
    }
    
    return book
  })
  
  // Thêm sách mới (yêu cầu xác thực)
  fastify.post('/books', { 
    preHandler: fastify.authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['title', 'author'],
        properties: {
          title: { type: 'string' },
          author: { type: 'string' },
          year: { type: 'number' },
          description: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const book = await fastify.bookModel.create(fastify.db, request.body)
    reply.code(201)
    return book
  })
  
  // Cập nhật sách (yêu cầu xác thực)
  fastify.put('/books/:id', {
    preHandler: fastify.authenticate,
    schema: {
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          author: { type: 'string' },
          year: { type: 'number' },
          description: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params
    const updated = await fastify.bookModel.update(fastify.db, id, request.body)
    
    if (!updated) {
      return reply.code(404).send({ error: 'Không tìm thấy sách' })
    }
    
    return updated
  })
  
  // Xóa sách (yêu cầu xác thực)
  fastify.delete('/books/:id', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const { id } = request.params
    const success = await fastify.bookModel.delete(fastify.db, id)
    
    if (!success) {
      return reply.code(404).send({ error: 'Không tìm thấy sách' })
    }
    
    return { message: 'Xóa sách thành công' }
  })
}
