//src/plugins/azure_queue
import fp from 'fastify-plugin';
import {  QueueClient } from '@azure/storage-queue';

export default fp(async (fastify) => {
    const queueClient = new QueueClient(
        process.env.AZURE_STORAGE_CONNECTION_STRING,
        'view-counts'// cái này là tên queue để phân biệt
    );

    //tạo queue, trường hợp nếu chưa chạy
    await queueClient.createIfNotExists();

    fastify.decorate('azureQueue', {
        sendView: async (bookId) => {
            const message = Buffer.from(JSON.stringify({ bookId })).toString('base64');
            await queueClient.sendMessage(message);
        }
    });

    fastify.addHook('onClose', async () => {
        //QUEUE CLIENT tự xử lý nên không cần đóng
    });
});