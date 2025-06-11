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
      // ✅ CRITICAL: Fix connection pool config
    max: 3,                      // Max 3 connections (was unlimited)
    min: 1,                      // Min 1 connection
    idleTimeoutMillis: 10000,    // 10s idle timeout (force cleanup)
    connectionTimeoutMillis: 3000, // 3s connection timeout
    acquireTimeoutMillis: 5000,    // 5s acquire timeout
    
    // ✅ CRITICAL: Enable automatic cleanup
    allowExitOnIdle: true,       // Allow process exit when idle
    keepAlive: true,             // Keep connections alive
    keepAliveInitialDelayMillis: 10000, // 10s initial delay
  });
  fastify.decorate('db', pool);
});