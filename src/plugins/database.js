//plugins/database.js
import { Pool } from "pg";
import fastifyPlugin from "fastify-plugin";

export default fastifyPlugin(async function (fastify) {
  const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT),
    ssl: { rejectUnauthorized: false },
        // ✅ Connection pool optimization (cơ bản):
    min: 2,                    // Luôn giữ ít nhất 2 connections
    max: 10,                   // Tối đa 10 connections 
    idleTimeoutMillis: 30000,  // Đóng connection không dùng sau 30s
    connectionTimeoutMillis: 2000, // Timeout khi tạo connection mới
    
    // ✅ Performance settings:
    keepAlive: true,           // Giữ connection alive
    keepAliveInitialDelayMillis: 10000,
  });

  fastify.decorate('db', pool);
});