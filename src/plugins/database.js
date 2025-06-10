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
    min: 1,                    // Minimum 1 connection (reduce resource usage)
    max: 3,                    // Max 3 connections (Azure B1ms limit)
    idleTimeoutMillis: 120000, // 2 minutes idle timeout (less aggressive)
    connectionTimeoutMillis: 15000, // 15s timeout for new connections
    acquireTimeoutMillis: 15000,    // 15s timeout to acquire from pool
    
    // ✅ Connection stability:
    keepAlive: true,
    keepAliveInitialDelayMillis: 30000, // 30s initial delay
    allowExitOnIdle: false,    // ✅ Don't exit when idle (prevent container restart)
    
    // ✅ Query timeouts:
    statement_timeout: 25000,  // 25s statement timeout
    query_timeout: 20000,      // 20s query timeout
    
    // ✅ Connection lifetime management:
    maxUses: 5000,            // Rotate connections after 5000 uses
  });
  //debug
  pool.on('connect', (client) => {
    fastify.log.info(`DB connection established. Pool: ${pool.totalCount}/${pool.options.max}`);
    
    // ✅ Set connection-level settings:
    client.query('SET statement_timeout = 25000').catch(() => {});
    client.query('SET lock_timeout = 10000').catch(() => {});
    client.query('SET idle_in_transaction_session_timeout = 60000').catch(() => {}); // ✅ Prevent idle transactions
  });

  pool.on('acquire', () => {
    if (pool.totalCount > 2) {
      fastify.log.debug(`DB connection acquired. Active: ${pool.totalCount - pool.idleCount}/${pool.totalCount}`);
    }
  });

  pool.on('error', (err, client) => {
    fastify.log.error('Database pool error:', err.message);
    // ✅ Don't crash on connection errors - let pool recover
  });

  pool.on('remove', () => {
    fastify.log.info(`DB connection removed. Total: ${pool.totalCount}`);
  });
  //
  fastify.decorate('db', pool);
});