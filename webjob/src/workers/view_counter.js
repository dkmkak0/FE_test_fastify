// src/workers/view_counter.js
import 'dotenv/config'; // Load .env variables
import { QueueClient } from '@azure/storage-queue';
import { Pool } from 'pg';

async function startWorker() {
  console.log('Starting worker...');

  // Check environment variables
  if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not defined');
  }
  if (!process.env.DB_USER || !process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_PASSWORD || !process.env.DB_PORT) {
    throw new Error('Database environment variables are missing');
  }

  console.log('Environment variables loaded successfully');

  try {
    const queueClient = new QueueClient(
      process.env.AZURE_STORAGE_CONNECTION_STRING,
      'view-counts'
    );

    console.log('QueueClient initialized');

    const pool = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: parseInt(process.env.DB_PORT),
      ssl: { rejectUnauthorized: false },
    });

    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('Connected to database');

    console.log('Worker waiting for messages');

    while (true) {
      try {
        const messages = await queueClient.receiveMessages({ maxMessages: 10 });
        if (messages.receivedMessageItems.length > 0) {
          const viewCountMap = new Map();
          for (const message of messages.receivedMessageItems) {
            const { bookId } = JSON.parse(Buffer.from(message.messageText, 'base64').toString());
            viewCountMap.set(bookId, (viewCountMap.get(bookId) || 0) + 1);
            await queueClient.deleteMessage(message.messageId, message.popReceipt);
            console.log(`Processed message for book ${bookId}`);
          }
          for (const [bookId, count] of viewCountMap) {
            await pool.query(
              'UPDATE books SET view_count = view_count + $1 WHERE id = $2',
              [count, bookId]
            );
            console.log(`Updated view count for book ${bookId} by ${count}`);
          }
          viewCountMap.clear();
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('Error processing message:', error.message);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error('Worker initialization error:', error.message);
    throw error;
  }
}

startWorker().catch(error => {
  console.error('Worker failed to start:', error.message);
  process.exit(1);
});