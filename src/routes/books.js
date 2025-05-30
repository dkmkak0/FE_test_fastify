export default async (fastify) => {
  fastify.get('/books', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1 },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              title: { type: 'string' },
              author: { type: 'string' },
              year: { type: 'integer' },
              description: { type: 'string' },
              image_url: { type: 'string', nullable: true },
              view_count: {type: 'integer'},
              like_count: {type: 'integer'},
              created_at: { type: 'string', format: 'date-time' },
              updated_at: { type: 'string', format: 'date-time', nullable: true },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { title } = request.query;
      fastify.log.info(`Searching books with title: ${title}`);
      
      const cacheKey = title && title.trim() !== '' ? `books:title:${title.toLowerCase()}` : 'books:all';
      
      const cachedBooks = await fastify.cache.get(cacheKey);
      if (cachedBooks) {
        fastify.log.info(`Returning cached books for key: ${cacheKey}`);
        return cachedBooks;
      }

      const startTime = Date.now();
      const books = await fastify.bookModel.getAll(fastify.db, title);
      const duration = Date.now() - startTime;
      fastify.log.info(`Books retrieved: ${books.length}, Query time: ${duration}ms`);

      await fastify.cache.set(cacheKey, books);
      return books;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Lỗi khi lấy danh sách sách', details: error.message });
    }
  });

  fastify.get('/books/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            title: { type: 'string' },
            author: { type: 'string' },
            year: { type: 'integer' },
            description: { type: 'string' },
            image_url: { type: 'string', nullable: true },
            view_count: {type: 'integer'},
            like_count: {type: 'integer'},
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      // đang lấy user từ jwt trước
      // do lần đầu xài nodejs nên không biết cách nào bắt user hiện tại khác cả
      // nên tạm thời bắt từ JWT trả về để biết là có user hay không
      let userId;
      try{
        await request.jwtquery();
        userId = request.user.id;// lấy từ jwt
      }catch  (error){
        // không có userId nên bỏ qua
      }

      // ghi sự kiện có người xem lại và bắn vào job
      await fastify.azureQueue.sendView(id);
      const cacheKey = `book:${id}`;
      //nếu là khách vãng lai thì lấy từ cache luôn cho đỡ xử lý is_liked
      if(!userId){
        const cachedBook = await fastify.cache.get(cacheKey);
        if (cachedBook) {
          return cachedBook;
        }
      }
      // rồi qua phần tối ưu hiệu xuất rồi, giờ mới xử lý mới nè
      // làm gì thì làm cũng phải validate book trước đk
      const book = await fastify.bookModel.getById(fastify.db, id);
      if (!book) {
        return reply.code(404).send({ error: 'Không tìm thấy sách' });
      }
      // oke rồi thì tạo lịch sử xem cho người dùng nè
      if(userId) {
        await await fastify.viewHistoryModel.addView(fastify.db, userId, id);
      }

      await fastify.cache.set(cacheKey, book);
      return book;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Lỗi khi lấy thông tin sách', details: error.message });
    }
  });

  fastify.post('/books', {
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    try {
      const parts = request.parts();
      const fields = {};
      let file;

      for await (const part of parts) {
        if (part.file) {
          const buffer = await part.toBuffer();
          if (buffer.length === 0) {
            return reply.code(400).send({
              error: 'Validation failed',
              details: 'File ảnh không hợp lệ: File rỗng'
            });
          }
          file = {
            buffer: buffer,
            filename: part.filename,
            mimetype: part.mimetype
          };
          const allowedFormats = ['image/jpeg', 'image/png', 'image/gif'];
          if (!allowedFormats.includes(file.mimetype)) {
            return reply.code(400).send({
              error: 'Validation failed',
              details: 'Định dạng file không được hỗ trợ. Chỉ hỗ trợ JPG, PNG, GIF.'
            });
          }
        } else {
          fields[part.fieldname] = part.value;
        }
      }

      if (!fields.title || !fields.author) {
        return reply.code(400).send({ 
          error: 'Validation failed',
          details: 'Thiếu các trường bắt buộc: title và author phải được cung cấp'
        });
      }

      const bookData = {
        title: fields.title,
        author: fields.author,
        year: fields.year ? parseInt(fields.year) : null,
        description: fields.description || null,
        image_url: null
      };

      if (file) {
        try {
          const base64Image = file.buffer.toString('base64');
          const dataUri = `data:${file.mimetype};base64,${base64Image}`;
          const uploadResult = await fastify.cloudinary.uploader.upload(dataUri, {
            resource_type: 'image',
          });
          bookData.image_url = uploadResult.secure_url;
        } catch (error) {
          fastify.log.error(error);
          return reply.code(500).send({ 
            error: 'Lỗi khi upload ảnh lên Cloudinary',
            details: error.message 
          });
        }
      }

      const book = await fastify.bookModel.create(fastify.db, bookData);
      await fastify.cache.del('books:all');
      await fastify.cache.delByPrefix('books:title:');
      await fastify.cache.set(`book:${book.id}`, book);
      return reply.code(201).send(book);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ 
        error: 'Lỗi khi tạo sách mới',
        details: error.message
      });
    }
  });

  fastify.put('/books/:id', {
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const parts = request.parts();
      const fields = {};
      let file;

      for await (const part of parts) {
        if (part.file) {
          const buffer = await part.toBuffer();
          if (buffer.length === 0) {
            return reply.code(400).send({
              error: 'Validation failed',
              details: 'File ảnh không hợp lệ: File rỗng'
            });
          }
          file = {
            buffer: buffer,
            filename: part.filename,
            mimetype: part.mimetype
          };
          const allowedFormats = ['image/jpeg', 'image/png', 'image/gif'];
          if (!allowedFormats.includes(file.mimetype)) {
            return reply.code(400).send({
              error: 'Validation failed',
              details: 'Định dạng file không được hỗ trợ. Chỉ hỗ trợ JPG, PNG, GIF.'
            });
          }
        } else {
          fields[part.fieldname] = part.value;
        }
      }

      const currentBook = await fastify.bookModel.getById(fastify.db, id);
      if (!currentBook) {
        return reply.code(404).send({ error: 'Không tìm thấy sách' });
      }

      const updates = {
        title: fields.title || currentBook.title,
        author: fields.author || currentBook.author,
        year: fields.year ? parseInt(fields.year) : currentBook.year,
        description: fields.description || null,
        image_url: currentBook.image_url
      };

      if (file) {
        try {
          const base64Image = file.buffer.toString('base64');
          const dataUri = `data:${file.mimetype};base64,${base64Image}`;
          const uploadResult = await fastify.cloudinary.uploader.upload(dataUri, {
            resource_type: 'image',
          });
          updates.image_url = uploadResult.secure_url;
        } catch (error) {
          fastify.log.error(error);
          return reply.code(500).send({ 
            error: 'Lỗi khi upload ảnh lên Cloudinary',
            details: error.message 
          });
        }
      }

      const updatedBook = await fastify.bookModel.update(fastify.db, id, updates);
      await fastify.cache.del('books:all');
      await fastify.cache.del(`book:${id}`);
      await fastify.cache.set(`book:${id}`, updatedBook);
      return updatedBook;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ 
        error: 'Lỗi khi cập nhật sách',
        details: error.message
      });
    }
  });

  fastify.delete('/books/:id', {
    preHandler: fastify.authenticate,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
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
      const { id } = request.params;
      const success = await fastify.bookModel.delete(fastify.db, id);
      if (!success) {
        return reply.code(404).send({ error: 'Không tìm thấy sách' });
      }
      await fastify.cache.del('books:all');
      await fastify.cache.delByPrefix('books:title:');
      await fastify.cache.del(`book:${id}`);
      return { message: 'Xóa sách thành công' };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ 
        error: 'Lỗi khi xóa sách',
        details: error.message
      });
    }
  });

  fastify.get('/books/suggestions', {
    schema: {
      querystring: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
        },
      },
      response: {
        200: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { query, limit = 10 } = request.query;
      fastify.log.info(`Searching suggestions for query: ${query}, limit: ${limit}`);

      const startTime = Date.now();
      const suggestions = await fastify.bookModel.getSuggestions(fastify.db, query, limit);
      const duration = Date.now() - startTime;
      fastify.log.info(`Suggestions: ${suggestions}, Search time: ${duration}ms`);

      return suggestions;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ 
        error: 'Lỗi khi lấy gợi ý tìm kiếm',
        details: error.message
      });
    }
  });

  // cái này là api cho nút like nè
  fastify.post('/books/:id/like', {
    preHandler: fastify.authenticate,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            liked: { type: 'boolean'},
            message: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: {type: 'string'},
          },
        },
      },
    },
   }, async (params) => {
    try {
    const { id } = request.params;
    // do ở đây bắt buộc có jwt rồi nên bắt luôn user được
    const userId = request.user.id;
    //validate book
    const book = await fastify.bookModel.getById(fastify.db, id);
    if(!book) {
      return reply.code(404).send({error: 'không tìm thấy sách'});
    }

    const result = await fastify.bookModel.toggleLike(fastify.db, userId, id);

    return {
      liked: result.liked,
      message: result.liked? 'Thích thành công' : 'bỏ thích thành công',
    };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({error: 'Lỗi khi thực hiện hành động thích sách', details: error.message});
    }
  });
};