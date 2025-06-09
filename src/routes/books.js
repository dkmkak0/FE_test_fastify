export default async (fastify) => {
  fastify.get('/books', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          title: { type: 'string', default: ''},
          page: { type: 'string',  default: 1},
          limit: { type: 'string',  default: 20},
          sort: {type: 'string', enum: ['newest', 'oldest', 'popular', 'like_count', 'view_count'], default: 'newest'},
          author: { type: 'string', default: ''},
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
          success: {type: 'boolean'},
          data: {
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
          pagination:{
            type: 'object',
            properties: {
              page: { type: 'integer'},
              limit: {type: 'integer'},
              total: {type: 'integer'},
              total_pages: {type: 'integer'},
              returned: {type: 'integer'},
              hasNext: {type: 'boolean'},
              hasPrevious: {type: 'boolean'},
            }
          },
        },
      },
    },
    },  }, async (request, reply) => {    try {      
      const { title, sort = 'newest', author } = request.query;
      const rawQuery = request.query;
      // tương đương với lệnh
      // const title = request.query.title || '';
      // const page = request.query.page || 1;
      // const limit = request.query.limit || 20;
      // const sort = request.query.sort || 'newest';
      // const author = request.query.author || null;
      const page = rawQuery.page && rawQuery.page.trim() !== '' 
        ? Math.max(1, parseInt(rawQuery.page) || 1) 
        : 1;
        
      const limit = rawQuery.limit && rawQuery.limit.trim() !== '' 
        ? Math.min(100, Math.max(1, parseInt(rawQuery.limit) || 20))
        : 20;
      fastify.log.info(`GET /books - title: "${title || 'all'}", author: "${author || 'all'}", sort: ${sort}, page: ${page}, limit: ${limit}`);
      // duyệt lại các tham số đầu vào, vì trong JS nếu không có giá trị thì sẽ là undefined
      // nên cần kiểm tra nếu không có giá trị thì sẽ là null
      const safeTitle = title && typeof title === 'string' ? title.trim() : ''; 
      const safeAuthor = author && typeof author === 'string' ? author.trim() : '';
      // Tạo cache key dựa trên tiêu đề và các tham số khác
      const cacheKey = `books:${safeTitle || 'all'}:${safeAuthor || 'all'}:${sort}:p${page}:l${limit}`;
      
      const cachedBooks = await fastify.cache.get(cacheKey);
      if (cachedBooks) {
        fastify.log.info(`Returning cached books for key: ${cacheKey}`);
        return cachedBooks;
      }
      
      const startTime = Date.now();
      // cái này là JS modern, gọi như là đối tượng luôn, thiếu trường cũng không sao
      // vmặc dù đã validate kỹ ở trên rồi =)), cẩn tắc vô áy náy mà đúng không các bạn
      const books = await fastify.bookModel.getAll({
        title: safeTitle || null,
        author: safeAuthor || null,
        sort: sort,
        page: page, 
        limit: limit,

      });
      // cái này để tính time thôi, làm sẵn, vì đường nào sau này cũng cần tối ưu
      // mặc dù hiện tại đã tối ưu rồi
      // nhưng vẫn cần để biết thời gian truy vấn
      // và có thể tối ưu hơn nữa nếu cần thiết
      // 6/8/2025 - <0,2s do mạng - chắc tối ưu hơn thì query thẳng chỉ mục với dùng thuật toán query thôi
      const duration = Date.now() - startTime;
      const dataLength = books.data ? books.data.length : 0;
      fastify.log.info(`Books retrieved: ${dataLength}, Query time: ${duration}ms`);

      // Lưu cache với TTL dài hơn cho danh sách tất cả sách
      let ttl;
      if(!safeTitle && !safeAuthor && page === 1 && sort === 'newest') {
      //Homepage: lưu cache 12 tiếng
      ttl = 3600 * 12; // 12 hours
      } else if(safeTitle || safeAuthor) {
        // cai này là tìm kiếm theo tiêu đề hoặc tác giả lưu ngắn thôi
        ttl = 3600 * 2; // 2 hour
      } else { 
        // cái này là phân trang với filter lưu vừa
        ttl = 3600 * 6;
      }
      await fastify.cache.set(cacheKey, books, ttl);
      fastify.log.info(`Cached books with key: ${cacheKey}, TTL: ${ttl}s`);
      
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
      const { id } = request.params;      // đang lấy user từ jwt trước
      // do lần đầu xài nodejs nên không biết cách nào bắt user hiện tại khác cả
      // nên tạm thời bắt từ JWT trả về để biết là có user hay không
      let userId;
      try{
        await request.jwtVerify();
        userId = request.user.id;// lấy từ jwt
      }catch  (error){
        // không có userId nên bỏ qua
      }      // ghi sự kiện có người xem lại và bắn vào job
      await fastify.azureQueue.sendView(id);
      const cacheKey = `book:${id}`;
      
      // Chiến lược cache thông minh hơn cho chi tiết sách
      // Nếu là khách vãng lai hoặc không cần thông tin is_liked
      if (!userId) {
        const cachedBook = await fastify.cache.get(cacheKey);
        if (cachedBook) {
          fastify.log.info(`Returning cached book for id: ${id} (anonymous user)`);
          return cachedBook;
        }
      } else {
        // Đối với người dùng đã đăng nhập
        // Kiểm tra xem có cache cho user-specific không
        const userCacheKey = `book:${id}:user:${userId}`;
        const cachedUserBook = await fastify.cache.get(userCacheKey);
        if (cachedUserBook) {
          fastify.log.info(`Returning user-specific cached book for id: ${id}, user: ${userId}`);
          return cachedUserBook;
        }
      }
      
      // Nếu không có cache hoặc không phù hợp, lấy dữ liệu từ database
      const book = await fastify.bookModel.getById(id, userId);
      if (!book) {
        return reply.code(404).send({ error: 'Không tìm thấy sách' });
      }
      
      // Cập nhật lịch sử xem cho người dùng đã đăng nhập
      if (userId) {
        await fastify.viewHistoryModel.addView(fastify.db, userId, id);
        
        // Lưu cache cho user-specific (ngắn hạn)
        const userCacheKey = `book:${id}:user:${userId}`;
        await fastify.cache.set(userCacheKey, book, 1800); // 30 phút
        fastify.log.info(`Cached user-specific book: ${userCacheKey}`);
      }
      
      // Luôn cập nhật cache chung
      await fastify.cache.set(cacheKey, book, 3600 * 24); // 24 giờ
      fastify.log.info(`Cached book: ${cacheKey}`);
      
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
      }      const book = await fastify.bookModel.create(bookData);
      
      // Thêm sách vào cache thay vì xóa toàn bộ cache
      // Chỉ cập nhật cache cho danh sách sách khi cần thiết
      if (await fastify.cache.exists('books:all')) {
        const cachedBooks = await fastify.cache.get('books:all');
        if (cachedBooks) {
          // Thêm sách mới vào đầu danh sách thay vì xóa toàn bộ cache
          cachedBooks.unshift(book);
          await fastify.cache.set('books:all', cachedBooks);
          fastify.log.info(`Updated books:all cache with new book: ${book.id}`);
        }
      }
      
      // Lưu cache cho chi tiết sách mới
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
      }      const currentBook = await fastify.bookModel.getById(id);
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
      }      const updatedBook = await fastify.bookModel.update(id, updates);
      
      // Cập nhật thông minh cho cache
      // 1. Cập nhật chi tiết sách
      await fastify.cache.set(`book:${id}`, updatedBook);
      
      // 2. Cập nhật cache danh sách sách nếu nó tồn tại mà không xóa toàn bộ
      if (await fastify.cache.exists('books:all')) {
        const cachedBooks = await fastify.cache.get('books:all');
        if (cachedBooks && cachedBooks.length > 0) {
          // Tìm và cập nhật sách trong danh sách cache
          const index = cachedBooks.findIndex(book => book.id === parseInt(id));
          if (index !== -1) {
            cachedBooks[index] = updatedBook;
            await fastify.cache.set('books:all', cachedBooks);
            fastify.log.info(`Updated book ${id} in books:all cache`);
          }
        }
      }
      
      // 3. Xử lý cache cho tìm kiếm theo tiêu đề nếu tiêu đề thay đổi
      if (currentBook.title !== updatedBook.title) {
        // Chỉ cần xóa cache tìm kiếm cụ thể chứa tiêu đề cũ nếu tiêu đề thay đổi
        const oldTitleCacheKey = `books:title:${currentBook.title.toLowerCase()}`;
        if (await fastify.cache.exists(oldTitleCacheKey)) {
          await fastify.cache.del(oldTitleCacheKey);
          fastify.log.info(`Deleted cache for old title: ${oldTitleCacheKey}`);
        }
      }
      
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
    try {      const { id } = request.params;
      const success = await fastify.bookModel.delete(id);
      if (!success) {
        return reply.code(404).send({ error: 'Không tìm thấy sách' });
      }
      
      // Cập nhật cache thông minh khi xóa sách
      // 1. Xóa cache chi tiết sách
      await fastify.cache.del(`book:${id}`);
      
      // 2. Cập nhật cache danh sách sách thay vì xóa toàn bộ
      if (await fastify.cache.exists('books:all')) {
        const cachedBooks = await fastify.cache.get('books:all');
        if (cachedBooks && cachedBooks.length > 0) {
          // Lọc bỏ sách đã xóa khỏi danh sách cache
          const updatedCache = cachedBooks.filter(book => book.id !== parseInt(id));
          await fastify.cache.set('books:all', updatedCache);
          fastify.log.info(`Removed book ${id} from books:all cache`);
        }
      }
      
      // 3. Xóa cache tìm kiếm theo tiêu đề chỉ khi cần thiết
      // Tìm tiêu đề của sách đã bị xóa trong bookModel.delete
      // và xóa cache tương ứng nếu cần
      
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
    try {      const { query, limit = 10 } = request.query;
      fastify.log.info(`Searching suggestions for query: ${query}, limit: ${limit}`);

      // Sử dụng getSuggestions từ bookModel
      // Phương thức này đã được tối ưu để sử dụng cache hiệu quả
      const startTime = Date.now();
      const suggestions = await fastify.bookModel.getSuggestions(query, limit);
      const duration = Date.now() - startTime;
      fastify.log.info(`Suggestions found: ${suggestions.length}, Search time: ${duration}ms`);

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
            like_count: { type: 'integer'},
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
    try {      const { id } = request.params;
      const userId = request.user.id; // lấy từ jwt
      
      // Kiểm tra xem sách có tồn tại không
      const book = await fastify.bookModel.getById(id);
      if (!book) {
        return reply.code(404).send({ error: 'Không tìm thấy sách' });
      }
      
      const result = await fastify.bookModel.toggleLike(userId, id);
      
      // Cập nhật cache thông minh khi like/unlike sách
      // 1. Vô hiệu hóa cache user-specific
      const userCacheKey = `book:${id}:user:${userId}`;
      await fastify.cache.del(userCacheKey);
      
      // 2. Cập nhật cache chi tiết sách chung (nếu tồn tại)
      const bookCacheKey = `book:${id}`;
      if (await fastify.cache.exists(bookCacheKey)) {
        const cachedBook = await fastify.cache.get(bookCacheKey);
        if (cachedBook) {
          // Cập nhật số lượng like
          cachedBook.like_count = result.liked 
            ? (cachedBook.like_count || 0) + 1 
            : Math.max((cachedBook.like_count || 0) - 1, 0);
          
          await fastify.cache.set(bookCacheKey, cachedBook);
          fastify.log.info(`Updated like count in book cache: ${bookCacheKey}`);
        }
      }
      
      // 3. Cập nhật cache trong danh sách sách (nếu tồn tại)
      if (await fastify.cache.exists('books:all')) {
        const cachedBooks = await fastify.cache.get('books:all');
        if (cachedBooks && cachedBooks.length > 0) {
          const index = cachedBooks.findIndex(b => b.id === parseInt(id));
          if (index !== -1) {
            // Cập nhật số lượng like
            cachedBooks[index].like_count = result.liked 
              ? (cachedBooks[index].like_count || 0) + 1 
              : Math.max((cachedBooks[index].like_count || 0) - 1, 0);
            
            await fastify.cache.set('books:all', cachedBooks);
            fastify.log.info(`Updated like count in books:all cache`);
          }
        }
      }
      
      return {
        liked: result.liked,
        like_count: result.like_count,
        message: result.liked ? 'Thích sách thành công' : 'Bỏ thích sách thành công',
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ 
        error: 'Lỗi khi xử lý like sách',
        details: error.message
      });
    }
  });
};