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
  });
  fastify.decorate('db', pool);
});