//app.js
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import databasePlugin from './plugins/database.js';
import authPlugin from './plugins/auth.js';
import cachePlugin from './plugins/cache.js';
import bookModel from './models/book.js';
import userModel from './models/user.js';
import bookRoutes from './routes/books.js';
import userRoutes from './routes/users.js';
import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import azureQueuePlugin from './plugins/azure_queue.js';
import viewHistoryModel from './models/view_history.js';
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
fastify.register(cachePlugin, {
    ttl: 30000 // 5 phút cache TTL
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
    fileSize: 32 * 1024 * 1024, // Giới hạn kích thước file (ví dụ: 10MB)
  },
});
fastify.register(azureQueuePlugin);
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
fastify.decorate('cloudinary', cloudinary);

// Đăng ký models
fastify.decorate('bookModel', bookModel);
fastify.decorate('userModel', userModel);
fastify.decorate('viewHistoryModel', viewHistoryModel);
//nạp dữ liệu gợi ý vào bộ nhớ
fastify.after(async () => {
  await fastify.bookModel.init(fastify.db);
  fastify.log.info('đã load xong dữ liệu gợi ý');
})

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
//cloudinary


// Khởi động server
const start = async () => {
  try {
    await fastify.listen({ 
      port: process.env.PORT || 8080, 
      host: '0.0.0.0' 
    });
    console.log(`Server đang chạy tại ${fastify.server.address().port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();