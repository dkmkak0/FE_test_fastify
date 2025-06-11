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
    
    // ✅ OPTIMIZED: Azure Web App specific settings
    max: 5,                      // Increase max connections slightly
    min: 2,                      // Keep minimum connections alive
    idleTimeoutMillis: 30000,    // 30s idle timeout (longer for Azure)
    connectionTimeoutMillis: 10000, // 10s connection timeout
    acquireTimeoutMillis: 10000,    // 10s acquire timeout
    
    // ✅ CRITICAL: Connection health checks
    allowExitOnIdle: false,      // Don't allow exit on idle for Azure
    keepAlive: true,             // Keep connections alive
    keepAliveInitialDelayMillis: 0, // Start keepalive immediately
    
    // ✅ NEW: Add query timeout
    statement_timeout: 30000,    // 30s query timeout
    query_timeout: 30000,        // 30s query timeout
  });

  // ✅ Add connection health check
  pool.on('connect', (client) => {
    fastify.log.info('New database connection established');
  });

  pool.on('error', (err) => {
    fastify.log.error('Database pool error:', err.message);
  });

  // ✅ Add periodic connection test
  const testConnection = async () => {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      fastify.log.debug('Database connection test successful');
    } catch (error) {
      fastify.log.error('Database connection test failed:', error.message);
    }
  };

  // Test connection every 4 minutes to prevent timeout
  const connectionTestInterval = setInterval(testConnection, 4 * 60 * 1000);

  fastify.decorate('db', pool);
  
  fastify.addHook('onClose', async () => {
    try {
      clearInterval(connectionTestInterval);
      await pool.end();
      fastify.log.info('Database pool closed');
    } catch (error) {
      fastify.log.error('Error closing database pool:', error.message);
    }
  });
});