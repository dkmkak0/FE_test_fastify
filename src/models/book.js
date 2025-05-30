// src/models/book.js
export default {
  titles: [],

  async init(db) {
    try {
      const query = `
        SELECT DISTINCT ON (title) title 
        FROM books 
        ORDER BY title, created_at DESC
      `;
      const result = await db.query(query);
      this.titles = result?.rows?.map(row => row.title) || [];
      console.log('Loaded titles:', this.titles);
    } catch (error) {
      console.error('Error in init:', error);
      this.titles = [];
    }
  },

  async getAll(db, title = null) {
    let query = `
      SELECT 
        id, title, author, year, description, image_url,
        view_count, 
        (SELECT COUNT(*) FROM book_likes WHERE book_id = books.id) as like_count,
        TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
        TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at
      FROM books
    `;
    const params = [];
    
    if (title && title.trim() !== '') {
      console.log(`Applying title filter: ${title}`);
      query += ` WHERE title ILIKE $1`;
      params.push(`%${title}%`);
    }
    
    query += ` ORDER BY created_at DESC`;
    console.log(`Executing query: ${query}, params: ${params}`);
    const result = await db.query(query, params);
    return result?.rows || [];
  },

  async getById(db, id, userId = null) {
    try {
      const query = `SELECT id, title, author, year, description, image_url, view_count, (SELECT COUNT(*) FROM book_likes WHERE book_id = books.id) AS like_count, EXISTS (SELECT 1 FROM book_likes WHERE book_id = books.id AND user_id = $2) AS is_liked, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at, TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at FROM books WHERE id = $1`;
      const result = await db.query(query, [id, userId || '']);
      return result?.rows[0] || null;
    } catch (error) {
      console.error('Error in getById:', error);
      throw error;
    }
  },

  async create(db, book) {
    try {
      const { title, author, year, description, image_url } = book;
      const result = await db.query(
        'INSERT INTO books (title, author, year, description, image_url, view_count, created_at) VALUES ($1, $2, $3, $4, $5, 0, NOW()) RETURNING *',
        [title, author, year, description, image_url]
      );
      const newBook = result?.rows[0] || null;
      if (newBook) {
        if (this.titles === undefined) {
          console.error('this.titles is undefined, initializing now');
          this.titles = [];
        }
        if (!Array.isArray(this.titles)) {
          console.error('this.titles is not an array, initializing now');
          this.titles = [];
        }
        if (!this.titles.includes(newBook.title)) {
          this.titles.unshift(newBook.title);
          console.log('Updated titles:', this.titles);
        }
      }
      return newBook;
    } catch (error) {
      console.error('Error in create:', error);
      throw error;
    }
  },

  async update(db, id, updates) {
    try {
      const { title, author, year, description, image_url } = updates;
      const oldBook = await this.getById(db, id);
      const result = await db.query(
        'UPDATE books SET title = $1, author = $2, year = $3, description = $4, image_url = $5, updated_at = NOW() WHERE id = $6 RETURNING *',
        [title, author, year, description, image_url, id]
      );
      const updatedBook = result?.rows[0] || null;
      if (updatedBook && oldBook) {
        if (this.titles === undefined) {
          console.error('this.titles is undefined, initializing now');
          this.titles = [];
        }
        if (!Array.isArray(this.titles)) {
          console.error('this.titles is not an array, initializing now');
          this.titles = [];
        }
        const index = this.titles.findIndex(t => t === oldBook.title);
        if (index !== -1) {
          if (!this.titles.includes(updatedBook.title)) {
            this.titles[index] = updatedBook.title;
          } else {
            this.titles.splice(index, 1);
          }
        } else if (!this.titles.includes(updatedBook.title)) {
          this.titles.unshift(updatedBook.title);
        }
      }
      return updatedBook;
    } catch (error) {
      console.error('Error in update:', error);
      throw error;
    }
  },

  async delete(db, id) {
    try {
      const book = await this.getById(db, id);
      const result = await db.query('DELETE FROM books WHERE id = $1 RETURNING *', [id]);
      const success = result?.rowCount > 0;
      if (success && book) {
        if (this.titles === undefined) {
          console.error('this.titles is undefined, initializing now');
          this.titles = [];
        }
        if (!Array.isArray(this.titles)) {
          console.error('this.titles is not an array, initializing now');
          this.titles = [];
        }
        this.titles = this.titles.filter(t => t !== book.title);
      }
      return success;
    } catch (error) {
      console.error('Error in delete:', error);
      throw error;
    }
  },

  async getSuggestions(db, query, limit = 10) {
    try {
      const searchQuery = query.toLowerCase();
      if (this.titles === undefined) {
        console.error('this.titles is undefined, initializing now');
        this.titles = [];
      }
      if (!Array.isArray(this.titles)) {
        console.error('this.titles is not an array, initializing now');
        this.titles = [];
      }
      const suggestions = this.titles
        .filter(title => title.toLowerCase().includes(searchQuery))
        .slice(0, limit);
      console.log('Suggestions from memory:', suggestions);
      return suggestions;
    } catch (error) {
      console.error('Error in getSuggestions:', error);
      return [];
    }
  },

  async incrementViewCount(db, id) {
    try {
      const result = await db.query(
        'UPDATE books SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count',
        [id]
      );
      return result?.rows[0]?.view_count || 0;
    } catch (error) {
      console.error('Error in incrementViewCount:', error);
      throw error;
    }
  },

  async toggleLike(db, userId, bookId) {
    try {
      const exists = await db.query(
        'SELECT 1 FROM book_likes WHERE user_id = $1 AND book_id = $2',
        [userId, bookId]
      );
      
      if (exists.rowCount > 0) {
        await db.query(
          'DELETE FROM book_likes WHERE user_id = $1 AND book_id = $2',
          [userId, bookId]
        );
        return { liked: false };
      } else {
        await db.query(
          'INSERT INTO book_likes (user_id, book_id, created_at) VALUES ($1, $2, NOW())',
          [userId, bookId]
        );
        return { liked: true };
      }
    } catch (error) {
      console.error('Error in toggleLike:', error);
      throw error;
    }
  }
};