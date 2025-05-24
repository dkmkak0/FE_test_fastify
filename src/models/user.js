//models/user.js
import bcrypt from 'bcrypt';

export default {
  findByUsername: async (db, username) => {
    const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0] || null;
  },

  create: async (db, userData) => {
    const { username, password } = userData;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = {
      id: Date.now().toString(),
      username,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
    };

    const result = await db.query(
      'INSERT INTO users (id, username, password, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, username, created_at',
      [newUser.id, newUser.username, newUser.password]
    );

    return result.rows[0];
  },

  validatePassword: async (user, password) => {
    return await bcrypt.compare(password, user.password);
  },
};