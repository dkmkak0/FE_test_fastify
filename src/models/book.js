export default {
  // Lưu trữ danh sách tiêu đề trong bộ nhớ để làm gợi ý tìm kiếm
  titles: [],

  // Tải danh sách tiêu đề khi khởi động hệ thống
  async init(db) {
    try {
      const query = `
        SELECT DISTINCT ON (title) title 
        FROM books 
        ORDER BY title, created_at DESC
      `;
      const result = await db.query(query);
      this.titles = result?.rows?.map(row => row.title) || [];
      console.log('Loaded titles into memory:', this.titles);
    } catch (error) {
      console.error('Error in init:', error);
      this.titles = []; // Đảm bảo titles luôn được khởi tạo
    }
  },

  // Lấy tất cả sách, hỗ trợ tìm kiếm theo tiêu đề
  async getAll(db, title = null) {
    let query = `
      SELECT 
        id, title, author, year, description, image_url, view_count,
        (SELECT COUNT(*) FROM book_likes where book_id = books.id) as like_count,
        TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
        TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at
      FROM books
    `;
    const params = [];
    
    if (title && title.trim() !== '') {
      console.log(`Applying title filter: ${title}`);
      query += ` WHERE title ILIKE $1`;
      params.push(`%${title}%`);
    } else {
      console.log('No title filter applied');
    }
    
    query += ` ORDER BY created_at DESC`;
    console.log(`Executing query: ${query}, params: ${params}`);
    const result = await db.query(query, params);
    return result?.rows || [];
  },

  // Lấy sách theo ID
  getById: async (db, id, userId = null) => {
    const query = `
    SELECT
    id, title, author, year, description, image_url, view_count,
    (SELECT COUNT(*) FROM book_likes where book_id = books.id) as like_count,
    EXISTS (
    SELECT 1 FROM book_likes
    WHERE book.id = books.id AND user_id = $2
    ) as is_liked,
     TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
     TO_CHAR(updated_at, 'YYYY-MM-DD HH25:MI:SS') as updated_at,
    FROM books
    WHERE id = $1
    `;

    const result = await db.query(query, [id, userId || '']);
    return result?.rows[0] || null;
  },

  // Thêm sách mới
  create: async function(db, book) {
    try {
      console.log('Context of this in create:', this); // Log ngữ cảnh this
      const { title, author, year, description, image_url } = book;
      const result = await db.query(
        'INSERT INTO books (title, author, year, description, image_url, view_count, created_at) VALUES ($1, $2, $3, $4, $5, 0, NOW()) RETURNING *',
        [title, author, year, description, image_url]
      );
      const newBook = result?.rows[0] || null;
      // Cập nhật danh sách tiêu đề
      if (newBook) {
        console.log('this.titles before update:', this.titles);
        if (this.titles === undefined) {
          console.error('this.titles is undefined, initializing now');
          this.titles = [];
        }
        if (!Array.isArray(this.titles)) {
          console.error('this.titles is not an array, initializing now');
          this.titles = [];
        }
        if (!this.titles.includes(newBook.title)) {
          this.titles.unshift(newBook.title); // Thêm tiêu đề mới vào đầu danh sách
          console.log('Updated titles:', this.titles);
        }
      }
      return newBook;
    } catch (error) {
      console.error('Error in create:', error);
      throw error;
    }
  },

  // Cập nhật sách
  update: async function(db, id, updates) {
    try {
      const { title, author, year, description, image_url } = updates;
      const oldBook = await this.getById(db, id);
      const result = await db.query(
        'UPDATE books SET title = $1, author = $2, year = $3, description = $4, image_url = $5, updated_at = NOW() WHERE id = $6 RETURNING *',
        [title, author, year, description, image_url, id]
      );
      const updatedBook = result?.rows[0] || null;
      // Cập nhật danh sách tiêu đề
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
            this.titles[index] = updatedBook.title; // Cập nhật tiêu đề mới
          } else {
            this.titles.splice(index, 1); // Nếu tiêu đề mới đã tồn tại, xóa tiêu đề cũ
          }
        } else if (!this.titles.includes(updatedBook.title)) {
          this.titles.unshift(updatedBook.title); // Thêm tiêu đề mới nếu chưa có
        }
      }
      return updatedBook;
    } catch (error) {
      console.error('Error in update:', error);
      throw error;
    }
  },

  // Xóa sách
  delete: async function(db, id) {
    const book = await this.getById(db, id);
    const result = await db.query('DELETE FROM books WHERE id = $1 RETURNING *', [id]);
    const success = result?.rowCount > 0;
    // Cập nhật danh sách tiêu đề
    if (success && book) {
      if (this.titles === undefined) {
        console.error('this.titles is undefined, initializing now');
        this.titles = [];
      }
      if (!Array.isArray(this.titles)) {
        console.error('this.titles is not an array, initializing now');
        this.titles = [];
      }
      this.titles = this.titles.filter(t => t !== book.title); // Xóa tiêu đề khỏi danh sách
    }
    return success;
  },

  // Lấy gợi ý tìm kiếm
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
  // cái này tăng view cho job bắn
  async increasementViewCount(db, id) {
    try{
      const result = await db.query(
        'UPDATE books SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count',
        [id]
      );
      return result?.rows[0]?.view_count || 0;
    }catch (error){
      console.error('Error in incrementViewCount:', error);
      throw error;
    }
  },
  // cái này là chức năng like
  async toggleLike(db, userId, bookId){
    const  exists = await db.query(
      'SELECT 1 FROM book_likes WHERE user_id = $1 AND book_id = $2',
      [userId, bookId]
    );
    
    if(exists.rowCount > 0){
      await db.query(
        'DELETE FROM book_likes WHERE user_id = $1 AND book_id = $2',
        [userId, bookId]
      );
      return { liked: false};
    } else{
      await db.query(
        'INSERT INTO book_likes (user_id, book_id, created_at) VALUES ($1, $2, NOW())',
        [userId, bookId]
      );
      return {liked: true};
    }
  }
};