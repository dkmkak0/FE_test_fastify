//app.js
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import databasePlugin from './plugins/database.js';
import authPlugin from './plugins/auth.js';
import bookModel from './models/book.js';
import userModel from './models/user.js';
import bookRoutes from './routes/books.js';
import userRoutes from './routes/users.js';
import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import azureQueuePlugin from './plugins/azure_queue.js';
import viewHistoryModel from './models/view_history.js';
import redisPlugin from './plugins/redis.js';

const fastify = Fastify({ 
  logger: true,
  ajv: {
    customOptions: {
      removeAdditional: 'all',
      coerceTypes: true,
      useDefaults: true,
    },
  },
});

// Đăng ký plugins
fastify.register(cors, { 
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
fastify.register(databasePlugin);
fastify.register(authPlugin);
fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 32 * 1024 * 1024, // Giới hạn kích thước file (32MB)
  },
});
fastify.register(azureQueuePlugin);
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
fastify.decorate('cloudinary', cloudinary);
fastify.register(redisPlugin);

// Đăng ký models
fastify.decorate('bookModel', bookModel(fastify));
fastify.decorate('userModel', userModel);
fastify.decorate('viewHistoryModel', viewHistoryModel);

// Đăng ký routes
fastify.register(bookRoutes, { prefix: '/api' });
fastify.register(userRoutes, { prefix: '/api' });

// Route mặc định
fastify.get('/', async () => {
  return { message: 'API Quản lý Sách hoạt động!' };
});

// Xử lý khi không tìm thấy route
fastify.setNotFoundHandler((request, reply) => {
  reply.code(404).send({ error: 'Không tìm thấy đường dẫn' });
});

// Xử lý lỗi
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  reply.code(error.statusCode || 500).send({ 
    error: error.message || 'Lỗi server' 
  });
});

// Khởi động server
const start = async () => {
  try {
    const port = process.env.PORT || 8080;
    await fastify.listen({ 
      port: port, 
      host: '0.0.0.0' 
    });
    fastify.log.info(`Server đang chạy tại cổng ${port}`);
    setImmediate(async () => {
      try {
        fastify.log.info('Starting background cache warming...');
        const titles = await fastify.bookModel.getTitles();
        fastify.log.info(`Background cache warming completed: ${titles.length} dữ liệu gợi ý`);
      } catch (error) {
        fastify.log.warn('Background cache warming failed:', error.message);
      }
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();