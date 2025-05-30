//src/workers/view_couter.js
import {  QueueClient } from "@azure/storage-queue";
import { Pool } from "pg";

async function startWoker() {
  const queueClient = new QueueClient(
    process.env.AZURE_STORAGE_CONNECTION_STRING,
    'view-counts'
  );
  const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT),
    ssl: {rejectUnauthorized: false},
  });

  console.log('worker waiting message');

  while (true) {
    try {
        const messages = await queueClient.receiveMessages({ maxMessages:10 });
    if(messages.receivedMessageItems.length > 0){
        const viewCountMap = new Map();
        for(const message of messages.receivedMessageItems) {
            const { bookId } = JSON.parse(Buffer.from(message.messageText, 'base64').toString());
            viewCountMap.set(bookId, (viewCountMap.get(bookId) || 0) + 1);
            await queueClient.deleteMessage(message.messageId, message.popReceipt);
        };
        for(const [bookId, count] of viewCountMap) {
            await pool.query(
                'UPDATE books SET view_count = view_count + $1 where id = $2',
                [count, bookId]
            );
            console.log(`Updated view count for book ${bookId} by ${count}`);
        }
        viewCountMap.clear();
    }
    await new Promise(resolve => setTimeout(resolve,10000));
    } catch (error) {
        console.error('Error processing message: ',error);
        await new Promise(resolve => setTimeout(resolve,10000));
    }
  }
};