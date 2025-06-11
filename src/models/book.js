// src/models/book.js
export default function bookModel(fastify) {
  return {
    /**
     * Retrieves all books from the database, optionally filtered by title.
     * phân trang giúp chia nhỏ dữ liệu thành các trang nhỏ để tăng hiệu suất và trải nghiệm người dùng.
     *
     * * @param {string|null} title - tiêu đề để lọc sách, null sẽ lấy tất cả sách
     * * @param {number} page - số trang (mặc định là 1). ví dụ page = 1 sẽ lấy trang đầu tiên
     * * @param {number} limit - số lượng sách trên mỗi trang (mặc định lấy 20) ví dụ limit = 20 thì sẽ lấy 20 sách
     * * @returns {Promise<Array>} - object chứa danh sách và tổng số sách.
     * * @throws {Error} - Throws an error if the database query fails.
     * */
    async getAll({title = null, page = 1, limit = 20, author = null, sort = 'newest'} = {}) {
      try {
        // Bước 1: Validate - kiểm tra chuẩn hoá dữ liệu đầu vào
        // Đảm bảo page luôn >= 1, ngay cả khi FE gửi giá trị là như "0" hoặc "1.5"
        const currentPage = Math.max(1, parseInt(page) || 1);

        // Đảm bảo limit luôn trong khoản 1-100 để tránh quá tải(lúc này server chỉ có 1 core 1GB ram)
        // hàm Math.max(1, ...) là đảm bảo tối thiểu 1
        // hàm Math.min(100, ...) là đảm bảo tối đa là 100
        const pageSize = Math.min(100, Math.max(1, parseInt(limit) || 20));

        // Tính toán offset - tính toán vị trí bắt đầu của dữ liệu
        // Offset: là vị trí bắt đầu lấy dữ liệu trong cơ sở dữ liệu.
        // ví dụ: offset 20 tức là sẽ bỏ qua 20 bản ghi đầu tiên.
        // Công thức: (trang_hiện_tại - 1) x số_lượng_mỗi_trang
        // Ví dụ: Trang 3, mỗi trang 20 sách, offset = (3 -1) x 20 = 40
        const offset = (currentPage - 1) * pageSize;

        fastify.log.info(`GetAll called: title = "${title || 'all'}, page = ${currentPage}, limit = ${pageSize}`);

        // Bước 2: Xây dựng Where Clause - điều kiện lọc dữ liệu
        const conditions = []; // chuỗi điều kiện WHERE cho SQL
        const baseParams = []; // Mảng parameters cho query đếm

        // kiểm tra xem có cần lọc theo title không
        if(title && typeof title === 'string' && title.trim() !== '') {
          // ờm chỗ này tui giải thích rõ hơn nhé
          // nếu có title thì thêm điều kiện lọc title vào whereClause
          // ILIKE là so sánh không phân biệt chữ hoa chữ thường
          //${baseParams.length + 1} là vị trí của tham số trong query
          // ví dụ: nếu baseParams.length = 0 thì vị trí của title sẽ là $1
          // nếu baseParams.length = 1 thì vị trí của title sẽ là $2
          // nếu baseParams.length = 2 thì vị trí của title sẽ là $3
          // và cứ thế tiếp tục
          // Điều này giúp tránh việc phải thay đổi query mỗi khi có thêm điều kiện lọc
          // tiện hơn hẳn đúng chứ, nên mấy cái if tiếp theo y chóc cái này
          // vì chẳng biết là tui cải tiến cái này tới bao giờ nữa
          // nhưng mà chắc chắn là kiểu gì cũng có nhiều điều kiện lọc hơn nữa
          // nên cứ để như này cho nó tiện
          //9/6/2025
          // ờm thì tui thêm index vào database để tăng tốc độ truy vấn
          // vì nếu không có index thì truy vấn sẽ chậm hơn rất nhiều
          // nhưng mà tui đánh index bằng gin
          // mà gin nó support mỗi tiếng anh à, nên tui phải đánh bằng lowercase
          conditions.push(`lower(books.title) ILIKE lower($${baseParams.length + 1})`); // Thêm điều kiện lọc title vào mảng conditions
          // cái baseParams này là cái gì? Chắc kèo ai cũng hỏi đúng không?
          // baseParams là mảng chứa các tham số sẽ được thay thế vào query
          // ví dụ: nếu title = "Harry Potter" thì baseParams sẽ là ['%Harry Potter%']
          // và query sẽ là: "SELECT ... FROM books WHERE title ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3"
          // cái này là để tránh việc phải thay đổi query mỗi khi có thêm điều kiện lọc
          // và cũng để tránh việc phải thay đổi vị trí của LIMIT và OFFSET trong query
          // vì nếu có title thì vị trí của LIMIT sẽ là baseParams.length + 1
          // còn vị trí của OFFSET sẽ là baseParams.length + 2
          // nếu không có title thì vị trí của LIMIT sẽ là 1
          // còn vị trí của OFFSET sẽ là 2
          // đấy xịn thế còn gì nữa ( ' - ')b
          // và cái % ở đầu và cuối là để tìm kiếm, mà cái này cơ bản chắc ai cũng biết rồi
          // nên tui không giải thích nữa
          baseParams.push(`%${title.trim()}%`); // THêm điều kiện lọc title vào mảng params
          fastify.log.info(`Filtering by title: ${title}`); 
        }
        if(author && typeof author === 'string' && author.trim() !== ''){
          // nếu có author thì thêm điều kiện lọc ở trên giải thích rồi ấy
          conditions.push(`lower(books.author) ILIKE lower($${baseParams.length + 1})`);
          baseParams.push(`%${author.trim()}%`);
          fastify.log.info(`Added author filter: ${author}`);
        }

        // Bước 2.1: Xử lý sort - sắp xếp dữ liệu
        // sort là cái để sắp xếp dữ liệu, mặc định là newest
        // nếu sort là newest thì sắp xếp theo created_at DESC
        // nếu sort là oldest thì sắp xếp theo created_at ASC
        // nếu sort là view_count thì sắp xếp theo view_count DESC
        // nếu sort là like_count thì sắp xếp theo like_count DESC
        // chỉ vậy thôi, dễ mà đúng hơm (' - ')b
        let orderBy;
        switch (sort) {
          case 'oldest':
            orderBy = 'ORDER BY books.created_at ASC';
            break;
          case 'popular': //cái này là phổ biến ấy
            orderBy = 'ORDER BY books.view_count DESC,  books.like_count DESC, books.created_at DESC';
            break;
          case 'like_count': // cái này là yêu thích nhất
            orderBy = 'ORDER BY books.like_count Desc, books.created_at DESC';
            break;
          case 'view_count': // cái này là lượt xem nhiều nhất
            orderBy = 'ORDER BY books.view_count DESC, books.created_at DESC';
            break;
          case 'newest': // cái này là mới nhất cũng là mặc định luôn
          default:
            orderBy = 'ORDER BY books.created_at DESC';
            break;
        }
        fastify.log.info(`Sorting by: ${sort}`);
        // Bước 2.2: Tạo whereClause - chuỗi điều kiện WHERE
        // Nếu như mà có conditions(tưc là length > 0) thì thêm WHERE vào
        // Nếu không có thì để trống
        // Mà nếu có thì join nó sẽ tự động thêm AND giữa các điều kiện
        // Ví dụ: nếu có title và author thì whereClause sẽ là "WHERE title ILIKE $1 AND author ILIKE $2"
        // Bước 3: chuẩn bị 2 query
        // Query 1: Đếm tổng số records để tính tổng số trang
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        // Ở đây có một vấn đề là nếu không có điều kiện lọc thì whereClause sẽ là ''
        // và nếu có điều kiện lọc thì whereClause sẽ là "WHERE title ILIKE $1 AND author ILIKE $2"
        // nên ở đây ta sẽ dùng một biến để lưu chuỗi whereClause
        // và sau đó sẽ dùng biến này trong query để tránh việc phải thay đổi query mỗi khi có thêm điều kiện lọc
        // Bước 3.1: Tạo query đếm tổng số bản ghi
        // Cái này là để tính tổng số bản ghi trong database để tính tổng số trang
        const countQuery = `SELECT COUNT(*) as total FROM books ${whereClause}`;
        // 7/8/2025
        // Query 2: Lấy dữ liệu với phân trang
        // === GIẢI THÍCH CÁCH HOẠT ĐỘNG CỦA DYNAMIC PARAMETERS ===
        //
        // Bước 1: Kiểm tra có title hay không
        // - Nếu có title: whereClause = "WHERE title ILIKE $1", baseParams = %`%${title.trim()}%`
        // - Nếu không có title: whereClause = "", baseParams = []
        //
        // Bước 2: Xây dựng query với dynamic parameters position
        // - baseParams.length + 1 = vị trí của LIMIT trong query
        // - baseParams.length + 2 = vị trí của OFFSET trong query
        // - Ví dụ: nếu baseParams.length = 1 (có title), thì LIMIT sẽ là $2 và OFFSET sẽ là $3
        // - Nếu baseParams.length = 0 (không có title), thì LIMIT sẽ là $1 và OFFSET sẽ là $2
        // - Điều này giúp tránh việc phải thay đổi query mỗi khi có thêm điều kiện lọc
        //
        // VÍ DỤ NÈ:
        // - Nếu có title:
        // - baseParams.length = 1
        // - Vì thế vị trí của LIMIT sẽ là baseParams.length + 1 = 2
        // - còn vị trí của OFFSET sẽ là baseParams.length + 2 = 3
        // - Query sẽ là: "SELECT ... FROM books WHERE title ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3"
        // - còn dataParams, cũng sẽ có 3 phần tử để gán:
        // - baseParams = ['%title%']
        // - dataParams = ['%title%', pageSize, offset], nên nó sẽ duy trì được tính động của LIMIT và OFFSET
        //
        // - Nếu không có title:
        // - baseParams.length = 0
        // - Vì thế vị trí của LIMIT sẽ là baseParams.length + 1 = 1
        // - còn vị trí của OFFSET sẽ là baseParams.length + 2 = 2
        // - Query sẽ là: "SELECT ... FROM books ORDER BY created_at DESC LIMIT $1 OFFSET $2"
        // - còn dataParams, cũng sẽ có 2 phần tử để gán:
        // - baseParams = []
        // - dataParams = [pageSize, offset], nên nó sẽ duy trì được tính động của LIMIT và OFFSET
        // OK hết
        //9/6/2025
        // Ờm thì sẽ có thay đổi chút xíu, giờ tui phải thêm điều kiện lọc vào nữa
        // Ở bản cập nhật này, tui sẽ thêm điều kiện where và sắp xếp dữ liệu(sort)
        // ở trên tui có mô tả rồi nên tui sẽ không giải thích lại nữa
        const dataQuery = `
        SELECT
        books.id, books.title, books.author, books.year, books.description, books.image_url, books.view_count,
        books.like_count,
        TO_CHAR(books.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
        TO_CHAR(books.updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at
        FROM books
        ${whereClause}
        ${orderBy}
        LIMIT $${baseParams.length + 1} OFFSET $${baseParams.length + 2}
        `;

        // Bước 4: Tạo parameters cho data query
        // Spread operator (...) sao chép tất cả phần tử từ baseParams vào dataParams
        // rồi thêm pageSize và offset vào cuối mảng
        // kết quả là dataParams sẽ có đúng số lượng parameters cần thiết cho query
        const dataParams = [...baseParams, pageSize, offset];

        // Cái này là log để debug thông tin query thôi
        fastify.log.info(`COUNT Query: ${countQuery}`);
        fastify.log.info(`DATA Query: ${dataQuery.replace(/\$[0-9]+/g, '?')}`);
        fastify.log.info(`COUNT Params: ${baseParams.join(', ')}`);
        fastify.log.info(`DATA Params: ${dataParams.join(', ')}`);

        // Bước 5: Thực hiện query đồng thời để tăng tốc
        // Promise.all sẽ chạy song song 2 query
        // Thời gian = max(query1_time, query2_time) thay vì là query1_time + query2_time
        // mà max(query1_time, query2_time) tức là thời gian lâu nhất trong 2 query
        const [countResult, dataResult] = await Promise.all([
          fastify.db.query(countQuery, baseParams), // query đếm tổng số bản ghi
          fastify.db.query(dataQuery, dataParams) // query lấy dữ liệu phân trang
        ]);

        // Bước 6: Xử lý kết quả từ database
        const total = parseInt(countResult.rows[0]?.total || 0);
        const books = dataResult?.rows || [];

        // Tính tổng số trang: chia tổng records cho số items mỗi trang, làm tròn lên
        // ví dụ: 155 books ÷ 20 per page = 7.75 -> Math.ceil(7.75) = 8 pages
        const totalPages = Math.ceil(total / pageSize);

        fastify.log.info(`Query completed: ${books.length} books found, total pages: ${totalPages}`);
        // Bước 7: trả về kết quả với Format API sẵn
        return {
          success: true, // Đánh giấu request thành công cho FE dễ check
          data: books, // Mảng sách của trang hiện tại
          pagination: {
            page: currentPage, // Trang hiện tại(đã validate ở bước 1)
            limit: pageSize, // Số lượng item mỗi trang(đã validate ở bước 1)
            total: total, // tổng số bản ghi trong database
            totalPages: totalPages, // tổng số trang có thể có
            returned: books.length, // số lượng sách trả về trong trang này
            hasNext: currentPage < totalPages, // có trang tiếp theo không?
            hasPrev: currentPage > 1 // có trang trước không?
          }
        }
      } catch (error) {
        fastify.log.error('Error in getAll:', error);
        throw {
          success: false,
          message: 'Failed to retrieve books',
          error: error.message || 'Unknown error'
        };
      }
    },
    /**
     * Retrieves a book by its ID, including details such as title, author, year, description, image_url,
     * view_count, like_count, and whether the book is liked by the user.
     * * If the userId is provided, it checks if the book is liked by that user.
     * * @param {number} id - The ID of the book to retrieve.
     * * @param {number|null} userId - The ID of the user to check if the book is liked by that user.
     * * @returns {Promise<Object|null>} - A promise that resolves to the book object if found, or null if not found.
     * * @throws {Error} - Throws an error if the database query fails.
     * * @example
     * * 
     * * 
     * * 
     * */
    async getById(id, userId = null) {
      try {
        const query = `
  SELECT 
    id, title, author, year, description, image_url, view_count, 
    (SELECT COUNT(*) FROM book_likes WHERE book_id = books.id) AS like_count, 
    EXISTS (SELECT 1 FROM book_likes WHERE book_id = books.id AND user_id = $2) AS is_liked, 
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at, 
    TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at 
  FROM books 
  WHERE id = $1
`;
        const result = await fastify.db.query(query, [id, userId || '']);
        return result?.rows[0] || null;
      } catch (error) {
        fastify.log.error('Error in getById:', error);
        throw error;
      }
    },
    /**
     * Creates a new book in the database with the provided details.
     * It also adds the book title to the cache for future suggestions.
     * * @param {Object} book - The book object containing title, author, year, description, and image_url.
     * * @returns {Promise<Object|null>} - A promise that resolves to the newly created book object, or null if creation failed.
     * * @throws {Error} - Throws an error if the database query fails.
     * * @example
     * */
    async create(book) {
      try {
        const { title, author, year, description, image_url } = book;
        const result = await fastify.db.query(
          'INSERT INTO books (title, author, year, description, image_url, view_count, created_at) VALUES ($1, $2, $3, $4, $5, 0, NOW()) RETURNING *',
          [title, author, year, description, image_url]
        );
        const newBook = result?.rows[0] || null;

        // nếu tạo thành công thì thêm title vào cache
        if (newBook) {
          fastify.log.info(`New book created and title "${newBook.title}" added to cache.`);
        }
        return newBook;
      } catch (error) {
        fastify.log.error('Error in create:', error);
        throw error;
      }
    },
    /**   * Updates an existing book in the database by its ID with the provided updates.
     * If the book is found and updated, it also updates the title in the titles cache if it has changed.
     * * @param {number} id - The ID of the book to update.
     * * @param {Object} updates - An object containing the fields to update (title, author, year, description, image_url).
     * * @returns {Promise<Object|null>} - A promise that resolves to the updated book object, or null if the update failed.
     * * @throws {Error} - Throws an error if the database query fails or if the book is not found.
     * */
    async update(id, updates) {
      try {
        const { title, author, year, description, image_url } = updates;
        const oldBook = await this.getById(id);
        if (!oldBook) {
          throw new Error(`Book with ID ${id} not found`);
        }
        const result = await fastify.db.query(
          'UPDATE books SET title = $1, author = $2, year = $3, description = $4, image_url = $5, updated_at = NOW() WHERE id = $6 RETURNING *',
          [title, author, year, description, image_url, id]
        );
        const updatedBook = result?.rows[0] || null;
        //nếu cập nhật thành công thì cập nhật cache
        if (updatedBook && oldBook.title !== updatedBook.title) {
          fastify.log.info(`Book with ID ${id} updated and title "${updatedBook.title}"`);
        }
        return updatedBook;
      } catch (error) {
        fastify.log.error('Error in update:', error);
        throw error;
      }
    },
    /**
     * Deletes a book by its ID from the database.
     * If the book is found and deleted, it also removes the title from the titles cache.
     * * @param {number} id - The ID of the book to delete.
     * * @returns {Promise<boolean>} - A promise that resolves to true if the book was deleted, false otherwise.
     * * @throws {Error} - Throws an error if the database query fails or if the book is not found.
     * */
    async delete(id) {
      try {
        const book = await this.getById(id);
        if (!book) {
          throw new Error(`Book with ID ${id} not found`);
        }
        const result = await fastify.db.query('DELETE FROM books WHERE id = $1 RETURNING *', [id]);
        const success = result?.rowCount > 0;
        if (success) {
          fastify.log.info(`Book with ID ${id} deleted and title "${book.title}" removed`);
        }
        return success;
      } catch (error) {
        fastify.log.error('Error in delete:', error);
        throw error;
      }
    },
    /**
     * Retrieves book suggestions based on a query string.
     * If the query is empty or only contains whitespace, it returns an empty array.
     * If the suggestions are cached, it returns them from the cache.
     * If not cached, it queries the database for titles that match the query string (case-insensitive),
     * and caches the results for future use.
     * * @param {string} query - The query string to search for in book titles.
     * * @param {number} [limit=10] - The maximum number of suggestions to return.
     * * @returns {Promise<Array>} - A promise that resolves to an array of book title suggestions.
     * * @throws {Error} - Throws an error if there is an issue with the cache or database.
     * * @example
     * * const suggestions = await bookModel.getSuggestions('Harry Potter');
     * * * This will return an array of book titles that contain 'Harry Potter', limited to 10 suggestions.
     * * * If the query is empty, it will return an empty array.
     * */
    async getSuggestions(query, limit = 10) {
      try {
        if (!query || query.trim() === '') {
          return [];
        }

        const searchQuery = query.toLowerCase();
        const cachedKey = `suggestions:${searchQuery}:${limit}`;

        // thử lấy từ cache suggestions
        const cachedSuggestions = await fastify.cache.get(cachedKey);
        if (cachedSuggestions) {
          fastify.log.info(`Loaded suggestions from cache for query: ${searchQuery}`);
          return cachedSuggestions;
        }

        fastify.log.info(`Suggestions not in cache, loading from database for query: ${searchQuery}`);

        //cái này query database với ranking
        const startTime = Date.now();
        const result = await fastify.db.query(`
        SELECT DISTINCT title, 
              CASE
                WHEN lower(title) LIKE $1 THEN 1
                WHEN lower(title) LIKE $2 THEN 2
                WHEN lower(title) LIKE $3 THEN 3
                ESLE 4
              END AS rank
        FROM books
        WHERE lower(title) LIKE lower($3)
        ORDER BY priority ASC, title_length ASC, title ASC
        LIMIT $4
        `, [searchQuery, `%${searchQuery}%`, `%${searchQuery}%`, limit]
        );
        const queryTime = Date.now() - startTime;
        const suggestions = result?.rows?.map(row => row.title) || [];
        //lưu cache lại kết quả tìm kiếm để giảm truy vấn
        let tt;
        let ttl;
    if (searchQuery.length <= 2) {
      ttl = 1800; // Short queries cache 30 minutes (popular)
    } else if (suggestions.length === 0) {
      ttl = 300;  // No results cache 5 minutes only
    } else {
      ttl = 600;  // Normal queries cache 10 minutes
    }
    fastify.log.info(`DB suggestions: "${searchQuery}" -> ${suggestions.length} results in ${queryTime}ms`);
        await fastify.cache.set(cachedKey, suggestions, ttl);
        fastify.log.info(`Suggestions loaded and cached for query: ${searchQuery}, found ${suggestions.length} items`);
        return suggestions;
      } catch (error) {
        fastify.log.error('Error in getSuggestions:', error);
        return [];
      }
    },
    /**
     * Increments the view count of a book by its ID.
     * If the book is found, it increments the view count by 1 and returns the updated view count.
     * * @param {number} id - The ID of the book to increment the view count for.
     * * @returns {Promise<number>} - A promise that resolves to the updated view count of the book.
     * * @throws {Error} - Throws an error if the database query fails or if the book is not found.
     * * @example
     * * const viewCount = await bookModel.incrementViewCount(1);
     * * * This will increment the view count of the book with ID 1 and return the updated view count.
     * */
    async incrementViewCount(id) {
      try {
        const result = await fastify.db.query(
          'UPDATE books SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count',
          [id]
        );
        return result?.rows[0]?.view_count || 0;
      } catch (error) {
        fastify.log.error('Error in incrementViewCount:', error);
        throw error;
      }
    },
    /**
     * Toggles the like status of a book for a user.
     * If the user has already liked the book, it removes the like.
     * If the user has not liked the book, it adds a like.
     * It also updates the like count of the book accordingly.
     * * @param {number} userId - The ID of the user liking or unliking the book.
     * * @param {number} bookId - The ID of the book to like or unlike.
     * * @returns {Promise<Object>} - A promise that resolves to an object indicating whether the book is liked or not.
     * * @throws {Error} - Throws an error if the database query fails.
     * * @example
     * * const result = await bookModel.toggleLike(123, 1);
     * * * This will toggle the like status of the book with ID 1 for the user with ID 123.
     * * * If the user has already liked the book, it will remove the like and return { liked: false }.
     * * * * If the user has not liked the book, it will add the like and return { liked: true }.
     * */
    async toggleLike(userId, bookId) {
      try {
        const client = await fastify.db.connect();
        try {
          await client.query('BEGIN');

          // Kiểm tra xem người dùng đã thích sách chưa
          const checkLikeQuery = 'SELECT * FROM book_likes WHERE user_id = $1 AND book_id = $2';
          const checkLikeResult = await client.query(checkLikeQuery, [userId, bookId]);

          if (checkLikeResult.rows.length > 0) {
            // Nếu đã thích, xoá like
            const deleteLikeQuery = 'DELETE FROM book_likes WHERE user_id = $1 AND book_id = $2';
            await client.query(deleteLikeQuery, [userId, bookId]);
            const updateCountQuery = `
          UPDATE books 
          SET like_count = (SELECT COUNT(*) FROM book_likes WHERE book_id = $1) 
          WHERE id = $1
          `;
            await client.query(updateCountQuery, [bookId]);
            await client.query('COMMIT');
            return { liked: false };
          } else {
            // Nếu chưa thích, thêm like
            const insertLikeQuery = 'INSERT INTO book_likes (user_id, book_id, created_at) VALUES ($1, $2, NOW())';
            await client.query(insertLikeQuery, [userId, bookId]);
            const updateCountQuery = `
          UPDATE books 
          SET like_count = (SELECT COUNT(*) FROM book_likes WHERE book_id = $1) 
          WHERE id = $1
          `;
            await client.query(updateCountQuery, [bookId]);
            await client.query('COMMIT');
            return { liked: true };
          }

        } catch (error) {
          await client.query('ROLLBACK');
          fastify.log.error('Error in toggleLike transaction:', error);
          throw error;
        } finally {
          client.release();
        }
      } catch (error) {
        fastify.log.error('Error in toggleLike:', error);
        throw error;
      }
    }
  }
};