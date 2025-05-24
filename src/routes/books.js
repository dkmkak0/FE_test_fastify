import axios from 'axios';
import FormData from 'form-data';

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
      
      // Kiểm tra cache
      const cachedBooks = await fastify.cache.get(cacheKey);
      if (cachedBooks) {
        fastify.log.info(`Returning cached books for key: ${cacheKey}`);
        return cachedBooks;
      }

      // Đo thời gian truy vấn
      const startTime = Date.now();
      const books = await fastify.bookModel.getAll(fastify.db, title);
      const duration = Date.now() - startTime;
      fastify.log.info(`Books retrieved: ${books.length}, Query time: ${duration}ms`);

      // Lưu vào cache
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

      // Parse dữ liệu từ multipart form
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
          // Kiểm tra định dạng file
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

      // Kiểm tra các trường bắt buộc
      if (!fields.title || !fields.author) {
        return reply.code(400).send({ 
          error: 'Validation failed',
          details: 'Thiếu các trường bắt buộc: title và author phải được cung cấp'
        });
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
        // Kiểm tra API key
        if (!process.env.IMGBB_API_KEY) {
          return reply.code(400).send({ 
            error: 'Server configuration error',
            details: 'ImgBB API key không được thiết lập. Vui lòng kiểm tra cấu hình server.'
          });
        }

        const formData = new FormData();
        formData.append('image', file.buffer, file.filename);
        formData.append('key', process.env.IMGBB_API_KEY);

        try {
          const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
            headers: formData.getHeaders(),
            timeout: 10000
          });

          if (response.data?.data?.url) {
            bookData.image_url = response.data.data.url;
          } else {
            return reply.code(400).send({ 
              error: 'Image upload failed',
              details: 'Không thể lấy URL ảnh từ ImgBB. Vui lòng thử lại.'
            });
          }
        } catch (error) {
          if (error.response && error.response.status === 400) {
            return reply.code(400).send({ 
              error: 'Image upload failed',
              details: 'Yêu cầu upload ảnh không hợp lệ. Có thể do API key không đúng hoặc file ảnh không được hỗ trợ (chỉ hỗ trợ JPG, PNG, GIF).'
            });
          }
          throw error; // Ném lỗi khác để xử lý ở catch bên ngoài
        }
      }

      // Lưu sách vào database
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
          // Kiểm tra định dạng file
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
        if (!process.env.IMGBB_API_KEY) {
          return reply.code(400).send({ 
            error: 'Server configuration error',
            details: 'ImgBB API key không được thiết lập. Vui lòng kiểm tra cấu hình server.'
          });
        }

        const formData = new FormData();
        formData.append('image', file.buffer, file.filename);
        formData.append('key', process.env.IMGBB_API_KEY);

        try {
          const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
            headers: formData.getHeaders(),
            timeout: 10000
          });

          if (response.data?.data?.url) {
            updates.image_url = response.data.data.url;
          } else {
            return reply.code(400).send({ 
              error: 'Image upload failed',
              details: 'Không thể lấy URL ảnh từ ImgBB. Vui lòng thử lại.'
            });
          }
        } catch (error) {
          if (error.response && error.response.status === 400) {
            return reply.code(400).send({ 
              error: 'Image upload failed',
              details: 'Yêu cầu upload ảnh không hợp lệ. Có thể do API key không đúng hoặc file ảnh không được hỗ trợ (chỉ hỗ trợ JPG, PNG, GIF).'
            });
          }
          throw error;
        }
      }

      const updatedBook = await fastify.bookModel.update(fastify.db, id, updates);
      await fastify.cache.del('books:all');
      await fastify.cache.delByPrefix('books:title:');
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
};