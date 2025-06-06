// src/models/book.js
export default function bookModel(fastify) {
  return {
    /**
     * Retrieves all unique book titles from the database.
     * If the titles are cached, it returns them from the cache.
     * If not cached, it queries the database and caches the results for future use.
     * @returns {Promise<Array>} - A promise that resolves to an array of unique book titles.
     * @throws {Error} - Throws an error if there is an issue with the cache or database.
     * @example
     * const titles = await bookModel.getTitles();
     * This will return an array of unique book titles from the database or cache.
     */
    async getTitles() {
      try {
        const cachedTitles = await fastify.cache.get('books:titles');
        if (cachedTitles) {
          fastify.log.info(`Loaded titles from cache: ${cachedTitles.length} items`);
          return cachedTitles;
        }
        // nếu chưa có cache thì lấy từ database
        fastify.log.info('Titles not in cache, loading titles from database');
        const result = await fastify.db.query(`
      SELECT DISTINCT ON (title) title
      FROM books
      ORDER BY title, created_at DESC
    `);
        fastify.log.info(`Titles loaded from database: ${result.rows.length} rows`);
        const titles = result?.rows?.map(row => row.title) || [];
        // lưu vào cache
        await fastify.cache.set('books:titles', titles, 168 * 60 * 60); // cache for 1 week
        fastify.log.info(`Titles loaded and cached: ${titles.length} items`);
        return titles;
      } catch (error) {
        fastify.log.error('Error in getTitles:', error);
        return [];
      }
    },

    /**   * Adds a new book title to the cache.
     * If the title already exists in the cache, it does nothing.
     * * @param {Object} fastify - The Fastify instance.
     *  * @param {string} title - The book title to add to the cache.
     *  * @returns {Promise<void>} - A promise that resolves when the title is added to the cache.
     * * @throws {Error} - Throws an error if there is an issue with the cache or database.
     * * @example
     * * await bookModel.addTitleToCache(fastify, 'New Book Title');
     * * * This will add 'New Book Title' to the cache if it does not already exist.
     * * * If the title already exists, it will log that the title already exists in cache.
     * */
    async addTitleToCache(title) {
      try {
        if (!title) return;

        // láy titles hiện tại
        const titles = await this.getTitles();

        // nếu titles đã tồn tại thì không cần thêm
        if (titles.includes(title)) {
          fastify.log.info(`Title "${title}" already exists in cache.`);
          return;
        }
        //thêm title mới vào đầu mảng
        titles.unshift(title);

        // cập nhật cache với mảng titles mới
        await fastify.cache.set('books:titles', titles, 168 * 60 * 60); // cache for 1 week
        fastify.log.info(`Title "${title}" added to cache.`);
      } catch (error) {
        fastify.log.error('Error in addTitleToCache:', error);
        throw error;
      }
    },
    /**   * Removes a book title from the cache.
     * If the title does not exist in the cache, it does nothing.
     * * @param {Object} fastify - The Fastify instance.
     * * @param {string} title - The book title to remove from the cache.
     * * @returns {Promise<void>} - A promise that resolves when the title is removed from the cache.
     * * @throws {Error} - Throws an error if there is an issue with the cache or database.
     * * @example
     * * await bookModel.removeTitleFromCache(fastify, 'Old Book Title');
     * * * This will remove 'Old Book Title' from the cache if it exists.
     * * * If the title does not exist, it will log that the title was not found in cache.
     * */
    async removeTitleFromCache(title) {
      try {
        if (!title) return;

        // lấy titles hiện tại
        const titles = await this.getTitles();

        //lọc title cần xoá
        const updatedTitles = titles.filter(t => t !== title);

        // nếu không có title nào được xoá thì không cần cập nhật cache
        if (updatedTitles.length === titles.length) {
          fastify.log.info(`Title "${title}" not found in cache.`);
          return;
        }
        //cập nhật cache mới
        await fastify.cache.set('books:titles', updatedTitles, 168 * 60 * 60); // cache for 1 week
        fastify.log.info(`Title "${title}" removed from cache.`);
      } catch (error) {
        fastify.log.error('Error in removeTitleFromCache:', error);
        throw error;
      }
    },
    /**   * Updates the titles cache by replacing an old title with a new title.
     * If the old title does not exist, it adds the new title to the cache.
     * * @param {Object} fastify - The Fastify instance.
     * * @param {string} oldTitle - The old book title to be replaced.
     * * @param {string} newTitle - The new book title to replace the old title with.
     * * @returns {Promise<void>} - A promise that resolves when the titles cache is updated.
     * * @throws {Error} - Throws an error if there is an issue with the cache or database.
     * * @example
     * * await bookModel.updateTitlesCache(fastify, 'Old Book Title', 'New Book Title');
     * * * This will replace 'Old Book Title' with 'New Book Title' in the cache.
     * * * If 'Old Book Title' does not exist, it will add 'New Book Title' to the cache.
     * */
    async updateTitlesCache(oldTitle, newTitle) {
      try {
        if (!oldTitle || !newTitle || oldTitle === newTitle) return;

        // lấy titles hiện tại
        const titles = await this.getTitles();

        //tìm vị trí của title cũ
        const index = titles.indexOf(oldTitle);

        // nếu không tìm thấy title cũ thì không cần cập nhật cache
        if (index === -1) {
          await this.addTitleToCache(newTitle);
          return;
        }

        if (titles.includes(newTitle)) {
          // nếu title mới đã tồn tại thì xoá title cũ
          titles.splice(index, 1);
        } else {
          // thay thế title cũ bằng title mới
          titles[index] = newTitle;
        }
        // cập nhật cache với mảng titles mới
        await fastify.cache.set('books:titles', titles, 168 * 60 * 60); // cache for 1 week
        fastify.log.info(`Title updated in cache: "${oldTitle}" -> "${newTitle}"`);
      } catch (error) {
        fastify.log.error('Error in updateTitlesCache:', error);
        throw error;
      }
    },
    /**
     * Retrieves all books from the database, optionally filtered by title.
     * If a title is provided, it filters books whose titles contain the given string (case-insensitive).
     * * The result includes book details such as id, title, author, year, description, image_url,
     * view_count, like_count, created_at, and updated_at.
     * * @param {string|null} title - The title to filter books by, or null to retrieve all books.
     * * @returns {Promise<Array>} - A promise that resolves to an array of book objects.
     * * @throws {Error} - Throws an error if the database query fails.
     * */
    async getAll(title = null) {
      let query = `
      SELECT 
        id, title, author, year, description, image_url,
        view_count, 
        (SELECT COUNT(*) FROM book_likes WHERE book_id = books.id) as like_count,
        TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
        TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at
      FROM books
    `;
      const params = [];      if (title && typeof title === 'string' && title.trim() !== '') {
        query += ` WHERE title ILIKE $1`;
        params.push(`%${title}%`);
      }

      query += ` ORDER BY created_at DESC`;
      const result = await fastify.db.query(query, params);
      return result?.rows || [];
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
     * * const book = await bookModel.getById(1, 123);
     * * * This will return the book with ID 1, including whether it is liked by the user with ID 123.
     * * * If the userId is not provided, it will return the book details without the like status.
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
          await this.addTitleToCache(newBook.title);
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
          await this.updateTitlesCache(oldBook.title, updatedBook.title);
          fastify.log.info(`Book with ID ${id} updated and title "${updatedBook.title}" cached.`);
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
          await this.removeTitleFromCache(book.title);
          fastify.log.info(`Book with ID ${id} deleted and title "${book.title}" removed from cache.`);
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

        //truy vấn title từ cache
        const titles = await this.getTitles();

        // lọc title
        const suggestions = titles
          .filter(title => title.toLowerCase().includes(searchQuery))
          .slice(0, limit);

        //lưu cache lại kết quả tìm kiếm để giảm truy vấn
        await fastify.cache.set(cachedKey, suggestions, 300);
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