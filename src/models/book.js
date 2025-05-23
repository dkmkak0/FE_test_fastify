export default {
  getAll: async (db) => {
    const result = await db.query('SELECT * FROM books');
    return result.rows;
  },

  getById: async (db, id) => {
    const result = await db.query('SELECT * FROM books WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  create: async (db, book) => {
    const { title, author, year, description, image_url } = book;
    const result = await db.query(
      'INSERT INTO books (title, author, year, description, image_url, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
      [title, author, year, description, image_url]
    );
    return result.rows[0];
  },

  update: async (db, id, updates) => {
    const { title, author, year, description, image_url } = updates;
    const result = await db.query(
      'UPDATE books SET title = $1, author = $2, year = $3, description = $4, image_url = $5, updated_at = NOW() WHERE id = $6 RETURNING *',
      [title, author, year, description, image_url, id]
    );
    return result.rows[0] || null;
  },

  delete: async (db, id) => {
    const result = await db.query('DELETE FROM books WHERE id = $1 RETURNING *', [id]);
    return result.rowCount > 0;
  },
};