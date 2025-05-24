//routes/book.js
import axios from 'axios';
import FormData from 'form-data';



export default async (fastify) => {
  // Lấy tất cả sách (không cần xác thực)
  fastify.get('/books', {
    schema: {
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
              created_at: { type: 'string', format: 'date-time' },
              updated_at: { type: 'string', format: 'date-time', nullable: true },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const cacheKey = 'books:all';
      const cachedBooks = await fastify.cache.get(cacheKey);
      if (cachedBooks) {
        return cachedBooks;
      }
      const books = await fastify.bookModel.getAll(fastify.db);
      return books;
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({ error: 'Lỗi khi lấy danh sách sách' });
    }
  });

  // Lấy sách theo ID (không cần xác thực)
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
      const cacheKey = `book:${id}`;
    const cachedBook = await fastify.cache.get(cacheKey);
    if (cachedBook) {
      return cachedBook;
    }
      const book = await fastify.bookModel.getById(fastify.db, id);
      if (!book) {
        return reply.code(404).send({ error: 'Không tìm thấy sách' });
      }
      await fastify.cache.set(cacheKey, book);
      return book;
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({ error: 'Lỗi khi lấy thông tin sách' });
    }
  });

  // Thêm sách mới (yêu cầu xác thực)
  fastify.post('/books', {
  preHandler: fastify.authenticate,
}, async (request, reply) => {
  try {
    const parts = request.parts();
    const fields = {};
    let file;

    // Parse dữ liệu từ multipart form
    for await (const part of parts) {
      if (part.file) {
        const buffer = await part.toBuffer();
        file = {
          buffer: buffer,
          filename: part.filename,
          mimetype: part.mimetype
        };
      } else {
        fields[part.fieldname] = part.value;
      }
    }

    // Kiểm tra các trường bắt buộc
    if (!fields.title || !fields.author) {
      return reply.code(400).send({ error: 'Thiếu các trường bắt buộc: title, author' });
    }

    // Tạo object dữ liệu sách
    const bookData = {
      title: fields.title,
      author: fields.author,
      year: fields.year ? parseInt(fields.year) : null,
      description: fields.description || null,
      image_url: null
    };

    // Nếu có file ảnh, upload lên ImgBB
    if (file) {
      const formData = new FormData();
      formData.append('image', file.buffer, file.filename);
      formData.append('key', process.env.IMGBB_API_KEY);

      const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
        headers: formData.getHeaders(),
        timeout: 10000
      });

      if (response.data?.data?.url) {
        bookData.image_url = response.data.data.url;
      }
    }

    // Lưu sách vào database
    const book = await fastify.bookModel.create(fastify.db, bookData);
    await fastify.cache.del('books:all'); // Xóa cache danh sách sách
    await fastify.cache.set(`book:${book.id}`, book); // Cache sách mới
    reply.code(201).send(book);
  } catch (error) {
    reply.code(500).send({ error: `Lỗi khi tạo sách mới: ${error.message}` });
  }
});

  // Cập nhật sách (yêu cầu xác thực)
  fastify.put('/books/:id', {
  preHandler: fastify.authenticate,
}, async (request, reply) => {
  try {
    const { id } = request.params;
    const parts = request.parts();
    const fields = {};
    let file;

    // Parse dữ liệu từ multipart form
    for await (const part of parts) {
      if (part.file) {
        const buffer = await part.toBuffer();
        file = {
          buffer: buffer,
          filename: part.filename,
          mimetype: part.mimetype
        };
      } else {
        fields[part.fieldname] = part.value;
      }
    }

    // Lấy thông tin sách hiện tại
    const currentBook = await fastify.bookModel.getById(fastify.db, id);
    if (!currentBook) {
      return reply.code(404).send({ error: 'Không tìm thấy sách' });
    }

    // Tạo object cập nhật, giữ nguyên giá trị hiện tại nếu không có dữ liệu mới
    const updates = {
      title: fields.title || currentBook.title,
      author: fields.author || currentBook.author,
      year: fields.year ? parseInt(fields.year) : currentBook.year,
      description: fields.description || currentBook.description,
      image_url: currentBook.image_url // Giữ nguyên image_url nếu không có file mới
    };

    // Nếu có file ảnh mới, upload lên ImgBB
    if (file) {
      const formData = new FormData();
      formData.append('image', file.buffer, file.filename);
      formData.append('key', process.env.IMGBB_API_KEY);

      const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
        headers: formData.getHeaders(),
        timeout: 10000
      });

      if (response.data?.data?.url) {
        updates.image_url = response.data.data.url;
      }
    }

    // Cập nhật sách trong database
    const updatedBook = await fastify.bookModel.update(fastify.db, id, updates);
    await fastify.cache.del('books:all'); // Xóa cache danh sách sách
    await fastify.cache.del(`book:${id}`); // Xóa cache sách cũ
    await fastify.cache.set(`book:${id}`, updatedBook); // Cache sách mới
    reply.send(updatedBook);
  } catch (error) {
    reply.code(500).send({ error: `Lỗi khi cập nhật sách: ${error.message}` });
  }
});

  // Xóa sách (yêu cầu xác thực)
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
      await fastify.cache.del('books:all'); // Xóa cache danh sách sách
    await fastify.cache.del(`book:${id}`); // Xóa cache sách đã xóa
      return { message: 'Xóa sách thành công' };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({ error: 'Lỗi khi xóa sách' });
    }
  });
};