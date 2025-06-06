//routes/users.js
export default async (fastify) => {
  // Đăng ký người dùng mới
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 3 },
          password: { type: 'string', minLength: 6 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                username: { type: 'string' },
                created_at: { type: 'string', format: 'date-time' },
              },
            },
            token: { type: 'string' },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { username, password } = request.body;

      // Kiểm tra xem username đã tồn tại chưa
      const existingUser = await fastify.userModel.findByUsername(fastify.db, username);
      if (existingUser) {
        return reply.code(400).send({ error: 'Username đã tồn tại' });
      }

      const user = await fastify.userModel.create(fastify.db, { username, password });
      const token = fastify.jwt.sign({ id: user.id, username: user.username });

      reply.code(201);
      return { user, token, message: 'Đăng ký thành công' };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({ error: 'Lỗi khi đăng ký người dùng' });
    }
  });

  // Đăng nhập
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                username: { type: 'string' },
                created_at: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { username, password } = request.body;

      const user = await fastify.userModel.findByUsername(fastify.db, username);
      if (!user) {
        return reply.code(401).send({ error: 'Thông tin đăng nhập không chính xác' });
      }

      const validPassword = await fastify.userModel.validatePassword(user, password);
      if (!validPassword) {
        return reply.code(401).send({ error: 'Thông tin đăng nhập không chính xác' });
      }

      const token = fastify.jwt.sign({ id: user.id, username: user.username });

      return {
        token,
        user: {
          id: user.id,
          username: user.username,
          created_at: user.created_at,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({ error: 'Lỗi khi đăng nhập' });
    }
  });

  // Lấy thông tin người dùng hiện tại
  fastify.get('/me', {
    preHandler: fastify.authenticate,
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            username: { type: 'string' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      return request.user;
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({ error: 'Lỗi khi lấy thông tin người dùng' });
    }
  });
  fastify.get('/view-history', {
    preHandler: fastify.authenticate,
    schema: {
      type: 'object',
      properties: {
        limit: {type: 'integer', minimum: 1, maximum:50},
      },
    },
    response: {
      200: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            book_id: {type: 'integer'},
            title: {type: 'string'},
            author: {type: 'string'},
            image_url: {type: 'string', nullable: true},
            viewed_at: {type: 'string', format: 'date-time'},
          },
        },
      },
      401: {
        type: 'object',
        properties: {
          error: {type: 'string'},
        },
      },
    },
  }, async (request, reply) => {
    try {
      const {limit = 10} = request.query;
      const userId = request.user.id;
      console.log('userId đang xem là: ',userId);
      const history = await fastify.viewHistoryModel.getViewHistory(fastify.db, userId, limit);
      return history;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({error: 'lỗi khi lấy lịch sử xem ', details: error.message });
    }
  }
)
};